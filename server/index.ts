// The market API. A plain Node HTTP server: no framework, no build step.
//
//   GET  /api/health
//   GET  /api/market/snapshot            full state for the client store
//   GET  /api/market/stream              SSE of partial patches
//   POST /api/auth/nonce                 { wallet, action, params } → { nonce, message }
//   POST /api/agents                     signed launch
//   POST /api/agents/:id/claim           signed claim
//   POST /api/agents/:id/fund            signed top-up (live: + txSig)
//   POST /api/agents/:id/policy          signed policy update
//
// Run:  npm run server            (paper settlement, devnet, no keys needed)
//       npm run server -- --seed 30   also create 30 house agents first

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Connection } from "@solana/web3.js";
import { verify, issueNonce, type Signed } from "./auth";
import { PaperChain, SolanaChain, type Chain } from "./chain";
import { CONFIG } from "./config";
import { Db } from "./db";
import { Engine, type Patch } from "./engine";
import { Keystore } from "./keystore";
import { LivePump, PaperPump, PumpFeed, type PumpActions } from "./pumpportal";
import { llm } from "./brains/llm";
import { xCredentials } from "./brains/shiller";
import type { LaunchInput, Policy } from "../lib/types";

const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

export async function boot(opts: { seed?: number; port?: number; dbFile?: string; dataDir?: string } = {}) {
  const db = new Db(opts.dbFile ?? CONFIG.dbFile);
  const keys = new Keystore(db, opts.dataDir ?? CONFIG.dataDir);
  const live = CONFIG.settlement === "live";
  const chain: Chain = live ? new SolanaChain(keys, CONFIG.rpc, CONFIG.cluster) : new PaperChain(db, keys);
  const pump: PumpActions = live && CONFIG.pumpLive ? new LivePump(keys, new Connection(CONFIG.rpc, "confirmed")) : new PaperPump();
  const feed = new PumpFeed(300, log);
  if (CONFIG.pumpFeed) feed.start();
  const engine = new Engine({ db, keys, chain, pump, feed, log: (m) => log(`[engine] ${m}`) });
  await engine.start();
  if (opts.seed && engine.agents.size === 0) await engine.seed(opts.seed);

  log(`llm: ${llm() ? "on" : "off (heuristic brains)"} · x: ${xCredentials() ? "on" : "off (dry posts)"} · pump feed: ${CONFIG.pumpFeed ? "on" : "off"} · pump launches: ${live && CONFIG.pumpLive ? "LIVE" : "paper"}`);

  // ── SSE clients
  const clients = new Set<ServerResponse>();
  engine.subscribe((p: Patch) => {
    const line = `data: ${JSON.stringify(p)}\n\n`;
    for (const res of clients) res.write(line);
  });
  const ping = setInterval(() => {
    for (const res of clients) res.write(": ping\n\n");
  }, 15_000);

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": CONFIG.corsOrigin });
    res.end(JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      let s = "";
      req.on("data", (c) => {
        s += c;
        if (s.length > 400_000) reject(new Error("body too large"));
      });
      req.on("end", () => {
        try {
          resolve(s ? JSON.parse(s) : {});
        } catch {
          reject(new Error("bad json"));
        }
      });
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const path = url.pathname;
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": CONFIG.corsOrigin,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }
    try {
      if (req.method === "GET" && path === "/api/health") {
        return json(res, 200, { ok: true, settlement: chain.mode, cluster: chain.cluster, agents: engine.agents.size, feed: feed.connected, tokens: feed.tokens.size, llm: !!llm() });
      }
      if (req.method === "GET" && path === "/api/market/snapshot") return json(res, 200, engine.snapshot());
      if (req.method === "GET" && path === "/api/market/stream") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          // no-transform: stops reverse proxies (incl. Next's rewrite proxy) gzip-buffering the stream
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": CONFIG.corsOrigin,
        });
        res.write(`data: ${JSON.stringify(engine.snapshot())}\n\n`);
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (req.method === "POST" && path === "/api/auth/nonce") {
        const b = await readBody(req);
        const wallet = String(b.wallet ?? "");
        const action = String(b.action ?? "");
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet) || !["launch", "claim", "fund", "policy"].includes(action)) return json(res, 400, { error: "bad wallet or action" });
        return json(res, 200, issueNonce(db, wallet, action, (b.params as Record<string, unknown>) ?? {}));
      }
      const m = /^\/api\/agents(?:\/([^/]+)\/(claim|fund|policy))?$/.exec(path);
      if (req.method === "POST" && m) {
        const b = await readBody(req);
        const auth = b.auth as Signed | undefined;
        if (!auth) return json(res, 400, { error: "missing auth" });
        const [, aid, action] = m;
        if (!aid) {
          const input = b.input as LaunchInput;
          verify(db, { ...auth, action: "launch", params: { name: input.name, ticker: input.ticker, type: input.type, startingSol: input.startingSol, devBuySol: input.devBuySol } });
          const agent = await engine.launchAgent({ ...input, ownerWallet: auth.wallet });
          return json(res, 200, agent);
        }
        if (action === "claim") {
          verify(db, { ...auth, action: "claim", params: { agent: aid } });
          return json(res, 200, await engine.claim(aid, auth.wallet));
        }
        if (action === "fund") {
          const sol = Number(b.sol ?? 0);
          const txSig = b.txSig ? String(b.txSig) : undefined;
          verify(db, { ...auth, action: "fund", params: { agent: aid, sol } });
          await engine.fund(aid, auth.wallet, sol, txSig);
          return json(res, 200, { ok: true });
        }
        if (action === "policy") {
          const policy = b.policy as Partial<Policy>;
          verify(db, { ...auth, action: "policy", params: { agent: aid, policy: JSON.stringify(policy) } });
          engine.setPolicy(aid, auth.wallet, policy);
          return json(res, 200, { ok: true });
        }
      }
      json(res, 404, { error: "not found" });
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  const port = opts.port ?? CONFIG.port;
  await new Promise<void>((r) => server.listen(port, r));
  log(`market api on http://localhost:${port}`);

  const stop = () =>
    new Promise<void>((r) => {
      clearInterval(ping);
      engine.stop();
      feed.stop();
      for (const c of clients) c.end();
      server.close(() => {
        db.close();
        r();
      });
    });
  return { engine, db, keys, chain, server, stop, port };
}

if (process.argv[1] && /server[\\/]index\.(ts|js)$/.test(process.argv[1])) {
  const seedArg = process.argv.indexOf("--seed");
  const seed = seedArg > -1 ? Number(process.argv[seedArg + 1] ?? 30) : 0;
  boot({ seed }).then(({ stop }) => {
    const bye = () => void stop().then(() => process.exit(0));
    process.on("SIGINT", bye);
    process.on("SIGTERM", bye);
  });
}
