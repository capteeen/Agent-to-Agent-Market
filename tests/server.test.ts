import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { Db } from "../server/db";
import { Keystore } from "../server/keystore";
import { PaperChain } from "../server/chain";
import { buildMessage, issueNonce, signWith, verify } from "../server/auth";
import { CONFIG } from "../server/config";
import { clampPolicy } from "../server/guardrails";
import { boot } from "../server/index";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.AGENT_LLM_DISABLED = "1";
process.env.PUMP_FEED = "0";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("keystore + paper chain", () => {
  const dir = mkdtempSync(join(tmpdir(), "am-"));
  const db = new Db(":memory:");
  const keys = new Keystore(db, dir);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("creates a key once and decrypts it back", () => {
    const pub = keys.create("a1");
    expect(keys.create("a1")).toBe(pub);
    expect(keys.signer("a1").publicKey.toBase58()).toBe(pub);
    expect(db.secret("a1")).not.toContain(pub); // stored encrypted, not plaintext
  });

  it("moves SOL between wallets and refuses overdrafts", async () => {
    const chain = new PaperChain(db, keys);
    const a = keys.create("a2");
    const b = keys.create("b2");
    await chain.mint(a, 1);
    const sig = await chain.transfer("a2", b, 0.25, "test");
    expect(sig.startsWith("paper")).toBe(true);
    expect(await chain.balance(a)).toBeCloseTo(0.75);
    expect(await chain.balance(b)).toBeCloseTo(0.25);
    expect(await chain.lookup(sig)).toEqual({ from: a, to: b, sol: 0.25 });
    await expect(chain.transfer("a2", b, 5)).rejects.toThrow(/insufficient/);
  });
});

describe("owner auth", () => {
  const db = new Db(":memory:");
  const owner = Keypair.generate();
  const wallet = owner.publicKey.toBase58();

  it("accepts a fresh signature over the issued message, once", () => {
    const { nonce, message } = issueNonce(db, wallet, "claim", { agent: "x" });
    const signature = signWith(owner.secretKey, message);
    expect(() => verify(db, { wallet, nonce, signature, action: "claim", params: { agent: "x" } })).not.toThrow();
    expect(() => verify(db, { wallet, nonce, signature, action: "claim", params: { agent: "x" } })).toThrow(/nonce/);
  });

  it("rejects a signature reused for a different action or agent", () => {
    const { nonce, message } = issueNonce(db, wallet, "claim", { agent: "x" });
    const signature = signWith(owner.secretKey, message);
    expect(() => verify(db, { wallet, nonce, signature, action: "fund", params: { agent: "x" } })).toThrow(/bad signature/);
    expect(() => verify(db, { wallet, nonce, signature, action: "claim", params: { agent: "y" } })).toThrow(/bad signature/);
  });

  it("rejects another wallet's nonce", () => {
    const other = Keypair.generate();
    const { nonce, message } = issueNonce(db, wallet, "policy", {});
    const signature = signWith(other.secretKey, buildMessage("policy", other.publicKey.toBase58(), nonce));
    expect(() => verify(db, { wallet: other.publicKey.toBase58(), nonce, signature, action: "policy" })).toThrow(/nonce/);
  });
});

describe("guardrails", () => {
  it("clamps owner policies into range", () => {
    expect(clampPolicy({ priceMult: 9, budgetPerHour: -1, risk: "cheap", autoClaimAt: 2 })).toEqual({ priceMult: 2, budgetPerHour: 0, risk: "cheap", autoClaimAt: 2 });
    expect(clampPolicy({})).toEqual({ priceMult: 1, budgetPerHour: 1, risk: "best", autoClaimAt: 0 });
  });
});

describe("engine (paper, fast clock)", () => {
  let app: Awaited<ReturnType<typeof boot>>;
  const dir = mkdtempSync(join(tmpdir(), "am-engine-"));
  beforeAll(async () => {
    CONFIG.jobEveryMs = [150, 300] as unknown as typeof CONFIG.jobEveryMs;
    CONFIG.workMs = [50, 150] as unknown as typeof CONFIG.workMs;
    CONFIG.tickMs = 100;
    CONFIG.balanceRefreshMs = 500;
    app = await boot({ port: 0, dbFile: ":memory:", dataDir: dir, seed: 8 });
  }, 20_000);
  afterAll(async () => {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs jobs with real escrow bookkeeping and conserves SOL", async () => {
    const { engine, chain, keys } = app;
    const wallets = () => [...engine.agents.keys(), "__escrow", "__treasury"].map((id) => keys.publicKey(id));
    const ledger = async () => {
      let s = 0;
      for (const w of wallets()) s += await chain.balance(w);
      return s;
    };
    const before = await ledger();
    const fees0 = engine.stats.feesEarned;
    await sleep(6000);
    const jobs = [...engine.jobs.values()];
    const done = jobs.filter((j) => j.status === "done");
    expect(jobs.length).toBeGreaterThan(3);
    expect(done.length).toBeGreaterThan(0);
    // every accepted/done job has a settlement signature from the chain adapter
    for (const j of jobs.filter((j) => j.status !== "open")) if (j.workerId) expect(j.txSig?.startsWith("paper")).toBe(true);
    // on the ledger, SOL only enters through (simulated) creator fees: agents + escrow + treasury = before + fees
    const after = await ledger();
    expect(after - before).toBeCloseTo(engine.stats.feesEarned - fees0, 6);
    // and the engine's in-memory balances agree with the ledger
    for (const a of engine.agents.values()) expect(a.balance).toBeCloseTo(await chain.balance(keys.publicKey(a.id)), 6);
  }, 15_000);

  it("escrow is empty once no job is in flight", async () => {
    const { engine, chain, keys } = app;
    // wait until nothing is accepted
    for (let i = 0; i < 40; i++) {
      if (![...engine.jobs.values()].some((j) => j.status === "accepted")) break;
      await sleep(200);
    }
    const inflight = [...engine.jobs.values()].filter((j) => j.status === "accepted").reduce((s, j) => s + j.price, 0);
    expect(await chain.balance(keys.publicKey("__escrow"))).toBeCloseTo(inflight, 6);
  }, 15_000);

  it("serves the snapshot and the owner API over HTTP", async () => {
    const base = `http://localhost:${(app.server.address() as { port: number }).port}`;
    const health = await (await fetch(`${base}/api/health`)).json();
    expect(health.settlement).toBe("paper");
    const snap = await (await fetch(`${base}/api/market/snapshot`)).json();
    expect(Object.keys(snap.agents).length).toBe(8);

    // launch an agent as a new owner
    const owner = Keypair.generate();
    const wallet = owner.publicKey.toBase58();
    const input = { type: "scout", name: "TEST SCOUT", ticker: "TST", image: "", description: "a test", startingSol: 1, devBuySol: 0.1 };
    const params = { name: input.name, ticker: input.ticker, type: input.type, startingSol: input.startingSol, devBuySol: input.devBuySol };
    const n = await (await fetch(`${base}/api/auth/nonce`, { method: "POST", body: JSON.stringify({ wallet, action: "launch", params }) })).json();
    const auth = { wallet, nonce: n.nonce, signature: signWith(owner.secretKey, n.message) };
    const created = await (await fetch(`${base}/api/agents`, { method: "POST", body: JSON.stringify({ auth, input }) })).json();
    expect(created.id).toMatch(/^scout_/);
    expect(created.ownerWallet).toBe(wallet);
    expect(created.balance).toBeCloseTo(1.12, 2); // starting + dev buy + creation fee, credited in paper mode
    expect(created.coinCA.endsWith("pump")).toBe(true);

    // policy update, then claim (nothing earned yet → 0)
    const policy = { priceMult: 1.5, budgetPerHour: 0.5, risk: "cheap", autoClaimAt: 0 };
    const n2 = await (await fetch(`${base}/api/auth/nonce`, { method: "POST", body: JSON.stringify({ wallet, action: "policy", params: { agent: created.id, policy: JSON.stringify(policy) } }) })).json();
    const r2 = await fetch(`${base}/api/agents/${created.id}/policy`, {
      method: "POST",
      body: JSON.stringify({ auth: { wallet, nonce: n2.nonce, signature: signWith(owner.secretKey, n2.message) }, policy }),
    });
    expect(r2.status).toBe(200);
    expect(app.engine.agents.get(created.id)?.policy?.priceMult).toBe(1.5);

    // someone else can't touch it
    const thief = Keypair.generate();
    const tw = thief.publicKey.toBase58();
    const n3 = await (await fetch(`${base}/api/auth/nonce`, { method: "POST", body: JSON.stringify({ wallet: tw, action: "claim", params: { agent: created.id } }) })).json();
    const r3 = await fetch(`${base}/api/agents/${created.id}/claim`, {
      method: "POST",
      body: JSON.stringify({ auth: { wallet: tw, nonce: n3.nonce, signature: signWith(thief.secretKey, n3.message) } }),
    });
    expect(r3.status).toBe(400);
    expect((await r3.json()).error).toMatch(/not your agent/);
  }, 15_000);
});
