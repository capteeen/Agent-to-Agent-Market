// pump.fun integration through PumpPortal (https://pumpportal.fun/creation
// and /local-trading-api). Two halves:
//   - actions: create a coin with a dev buy, collect creator fees. Both use
//     the "local transaction" API: PumpPortal builds the transaction, we sign
//     it with the agent's server key and send it ourselves. No API key needed.
//   - data: the websocket feed of new tokens and trades that Scouts watch.
// In paper mode the actions are simulated; the feed can still be real.
//
// NOTE: validated against the public docs, not against mainnet with real SOL.
// Run a full paper season on devnet before enabling live launches.

import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { createHash } from "node:crypto";
import type { Keystore } from "./keystore";

const TRADE_LOCAL = "https://pumpportal.fun/api/trade-local";
const IPFS = "https://pump.fun/api/ipfs";
export const DATA_WS = "wss://pumpportal.fun/api/data";

export interface LaunchParams {
  name: string;
  symbol: string;
  description: string;
  /** data URL or https URL of the image */
  image: string;
  devBuySol: number;
  twitter?: string;
  website?: string;
}

export interface LaunchResult {
  mint: string;
  txSig: string;
  metadataUri: string;
}

export interface PumpActions {
  launch(agentId: string, p: LaunchParams): Promise<LaunchResult>;
  /** Claims accrued creator fees into the agent wallet. Returns the tx sig, or null if nothing to claim. */
  collectCreatorFee(agentId: string): Promise<string | null>;
}

async function imageBlob(image: string): Promise<Blob> {
  if (image.startsWith("data:")) {
    const [head, b64] = image.split(",");
    const type = /data:([^;]+)/.exec(head)?.[1] ?? "image/png";
    return new Blob([Buffer.from(b64, "base64")], { type });
  }
  const res = await fetch(image);
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  return res.blob();
}

export class LivePump implements PumpActions {
  constructor(
    private keys: Keystore,
    private conn: Connection,
    private priorityFee = 0.0005,
  ) {}

  async launch(agentId: string, p: LaunchParams): Promise<LaunchResult> {
    const creator = this.keys.signer(agentId);
    const mint = Keypair.generate();

    // 1. metadata + image to pump.fun IPFS
    const form = new FormData();
    form.append("file", await imageBlob(p.image), "agent.png");
    form.append("name", p.name);
    form.append("symbol", p.symbol);
    form.append("description", p.description);
    if (p.twitter) form.append("twitter", p.twitter);
    if (p.website) form.append("website", p.website);
    form.append("showName", "true");
    const meta = await fetch(IPFS, { method: "POST", body: form });
    if (!meta.ok) throw new Error(`ipfs upload failed: ${meta.status} ${await meta.text()}`);
    const { metadataUri } = (await meta.json()) as { metadataUri: string };

    // 2. PumpPortal builds the create (+dev buy) transaction
    const res = await fetch(TRADE_LOCAL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: creator.publicKey.toBase58(),
        action: "create",
        tokenMetadata: { name: p.name, symbol: p.symbol, uri: metadataUri },
        mint: mint.publicKey.toBase58(),
        denominatedInSol: "true",
        amount: p.devBuySol,
        slippage: 10,
        priorityFee: this.priorityFee,
        pool: "pump",
      }),
    });
    if (!res.ok) throw new Error(`pumpportal create failed: ${res.status} ${await res.text()}`);

    // 3. sign with the mint and the creator, send ourselves
    const tx = VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
    tx.sign([mint, creator]);
    const txSig = await this.conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await this.conn.confirmTransaction(txSig, "confirmed");
    return { mint: mint.publicKey.toBase58(), txSig, metadataUri };
  }

  async collectCreatorFee(agentId: string): Promise<string | null> {
    const creator = this.keys.signer(agentId);
    const res = await fetch(TRADE_LOCAL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey: creator.publicKey.toBase58(), action: "collectCreatorFee", priorityFee: this.priorityFee, pool: "pump" }),
    });
    if (res.status === 400) return null; // nothing to collect
    if (!res.ok) throw new Error(`pumpportal collectCreatorFee failed: ${res.status} ${await res.text()}`);
    const tx = VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
    tx.sign([creator]);
    const sig = await this.conn.sendRawTransaction(tx.serialize());
    await this.conn.confirmTransaction(sig, "confirmed");
    return sig;
  }
}

/** Paper mode: no coin is created; the mint is a deterministic fake ending in "pump". */
export class PaperPump implements PumpActions {
  async launch(agentId: string, p: LaunchParams): Promise<LaunchResult> {
    const h = createHash("sha256").update(`${agentId}${p.symbol}${Date.now()}`).digest();
    const bs58 = (await import("bs58")).default;
    const mint = bs58.encode(h).slice(0, 40) + "pump";
    return { mint, txSig: "paper" + h.toString("hex").slice(0, 80), metadataUri: `paper://${p.symbol}` };
  }
  async collectCreatorFee() {
    return null;
  }
}

// ───────────────────────────── data feed ─────────────────────────────

export interface TokenStats {
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  createdAt: number;
  trades: number;
  buys: number;
  sells: number;
  buyVolumeSol: number;
  sellVolumeSol: number;
  traders: Set<string>;
  marketCapSol: number;
  lastTradeAt: number;
  devSold: boolean;
}

/** Keeps a rolling window of pump.fun launches and their trades. */
export class PumpFeed {
  tokens = new Map<string, TokenStats>();
  connected = false;
  private ws: WebSocket | null = null;
  private stopped = false;
  private subscribed: string[] = [];

  constructor(
    private maxTokens = 300,
    private log: (m: string) => void = () => {},
  ) {}

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.ws?.close();
  }

  private connect() {
    if (this.stopped) return;
    try {
      const ws = new WebSocket(DATA_WS);
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true;
        this.log("pump feed connected");
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
        if (this.subscribed.length) ws.send(JSON.stringify({ method: "subscribeTokenTrade", keys: this.subscribed }));
      };
      ws.onmessage = (ev) => {
        try {
          this.ingest(JSON.parse(String(ev.data)));
        } catch {}
      };
      let reconnecting = false;
      const retry = (why: string) => {
        if (reconnecting || this.stopped) return;
        reconnecting = true;
        this.connected = false;
        this.log(`pump feed ${why}; reconnecting in 10s`);
        setTimeout(() => this.connect(), 10_000);
      };
      ws.onclose = () => retry("closed");
      // don't call close() here: undici re-fires error from inside close()
      ws.onerror = () => retry("error");
    } catch (e) {
      this.log(`pump feed error ${String(e)}`);
      setTimeout(() => this.connect(), 10_000);
    }
  }

  /** Message shapes per the PumpPortal docs; unknown fields are ignored. */
  ingest(m: Record<string, unknown>) {
    const mint = String(m.mint ?? "");
    if (!mint) return;
    const type = String(m.txType ?? "");
    const now = Date.now();
    if (type === "create") {
      this.tokens.set(mint, {
        mint,
        name: String(m.name ?? ""),
        symbol: String(m.symbol ?? ""),
        creator: String(m.traderPublicKey ?? ""),
        createdAt: now,
        trades: 0,
        buys: 0,
        sells: 0,
        buyVolumeSol: 0,
        sellVolumeSol: 0,
        traders: new Set(),
        marketCapSol: Number(m.marketCapSol ?? 0),
        lastTradeAt: now,
        devSold: false,
      });
      this.watch(mint);
      if (this.tokens.size > this.maxTokens) {
        const oldest = [...this.tokens.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
        this.tokens.delete(oldest.mint);
      }
      return;
    }
    const t = this.tokens.get(mint);
    if (!t) return;
    const sol = Number(m.solAmount ?? 0);
    const trader = String(m.traderPublicKey ?? "");
    t.trades++;
    t.lastTradeAt = now;
    if (trader) t.traders.add(trader);
    if (type === "buy") {
      t.buys++;
      t.buyVolumeSol += sol;
    } else if (type === "sell") {
      t.sells++;
      t.sellVolumeSol += sol;
      if (trader && trader === t.creator) t.devSold = true;
    }
    if (m.marketCapSol !== undefined) t.marketCapSol = Number(m.marketCapSol);
  }

  private watch(mint: string) {
    this.subscribed.push(mint);
    if (this.subscribed.length > this.maxTokens) this.subscribed.shift();
    if (this.ws && this.connected) this.ws.send(JSON.stringify({ method: "subscribeTokenTrade", keys: [mint] }));
  }

  /** Simple momentum score; the Scout brain sends the top few to the LLM. */
  score(t: TokenStats, now = Date.now()) {
    const ageMin = Math.max(0.5, (now - t.createdAt) / 60_000);
    const net = t.buyVolumeSol - t.sellVolumeSol;
    const traders = t.traders.size;
    const recency = Math.max(0, 1 - (now - t.lastTradeAt) / 600_000);
    return (net * 2 + traders * 0.3 + t.marketCapSol * 0.05) * (0.5 + recency) / Math.sqrt(ageMin) - (t.devSold ? 20 : 0);
  }

  candidates(n = 8): TokenStats[] {
    const now = Date.now();
    return [...this.tokens.values()]
      .filter((t) => t.trades >= 3)
      .sort((a, b) => this.score(b, now) - this.score(a, now))
      .slice(0, n);
  }
}
