// The Phase 2 market engine. Same rules as the Phase 1 simulator
// (lib/sim.ts), but every balance change is a settlement through the chain
// adapter, every decision comes from a brain, and the state lives in SQLite.
//
//   tick (1s):  post jobs · assign workers (escrow) · run brains · settle ·
//               expire · rent · deaths · hourly rollups · broadcast patches
//   10 min:     claim creator fees (live) / simulate them (paper)
//
// Nothing here signs a transaction: that is chain.ts, which only moves SOL
// after guardrails.assertAllowed() has passed.

import { randomBytes } from "node:crypto";
import { makePersona } from "../lib/persona";
import { emptyRep, recordHirerPnl, recordOutcome, score } from "../lib/reputation";
import { DEFAULT_POLICY, HISTORY_HOURS, SERVICE_OF, type Agent, type AgentHistory, type AgentType, type EventKind, type Job, type LaunchInput, type MarketEvent, type MarketReport, type MarketStats, type Policy, type Service } from "../lib/types";
import { HOUR, computeReport, emptyHistory, hourFloor, policyOf } from "../lib/world";
import type { RepStats } from "../lib/reputation";
import { BASE_PRICE, decideHire } from "./brains/launcher";
import { gradePick, scoutPick } from "./brains/scout";
import { shill } from "./brains/shiller";
import type { Chain } from "./chain";
import { CONFIG } from "./config";
import type { Db } from "./db";
import { assertAllowed, clampPolicy, GUARDRAILS, KillSwitch } from "./guardrails";
import type { Keystore } from "./keystore";
import type { PumpActions, PumpFeed } from "./pumpportal";

export const ESCROW_ID = "__escrow";
export const TREASURY_ID = "__treasury";

/** What the client store ingests (lib/store.ts → ingest). */
export interface Patch {
  agents?: Record<string, Agent>;
  order?: string[];
  jobs?: Job[];
  events?: MarketEvent[];
  stats?: MarketStats;
  history?: Record<string, AgentHistory>;
  reports?: MarketReport[];
  rep?: Record<string, RepStats>;
  simTime?: number;
  /** patches only: agent ids removed from the map (rubble cleared) */
  removed?: string[];
}

interface Deps {
  db: Db;
  keys: Keystore;
  chain: Chain;
  pump: PumpActions;
  feed: PumpFeed;
  log?: (m: string) => void;
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const id = (p: string) => `${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

export class Engine {
  readonly kill = new KillSwitch();
  agents = new Map<string, Agent>();
  jobs = new Map<string, Job>();
  events: MarketEvent[] = []; // newest first
  history: Record<string, AgentHistory> = {};
  rep: Record<string, RepStats> = {};
  stats: MarketStats = { agentsAlive: 0, jobsCompleted: 0, solMoved: 0, feesEarned: 0 };
  reports: MarketReport[] = [];
  private boost: Record<string, { q: number; until: number }[]> = {};
  private spentHour: Record<string, number> = {};
  private hiresHour: Record<string, number> = {};
  private claimedHour: Record<string, number> = {};
  private hourFees: Record<string, number> = {};
  private lastPickAt: Record<string, number> = {};
  private lastAttentionAt: Record<string, number> = {};
  private hourStart = hourFloor(Date.now());
  private nextPost = 0;
  private nextRent = 0;
  private nextFees = 0;
  private nextBalances = 0;
  private busy = new Set<string>(); // agents currently working a job
  private timers: { at: number; fn: () => void }[] = [];
  private dirtyAgents = new Set<string>();
  private dirtyJobs = new Set<string>();
  private dirtyHist = new Set<string>();
  private newEvents: MarketEvent[] = [];
  private removed: string[] = [];
  private statsDirty = false;
  private listeners = new Set<(p: Patch) => void>();
  private iv?: ReturnType<typeof setInterval>;
  private ticking = false;
  private log: (m: string) => void;

  constructor(private d: Deps) {
    this.log = d.log ?? ((m) => console.log(`[engine] ${m}`));
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  async start() {
    const { db, keys } = this.d;
    keys.create(ESCROW_ID);
    keys.create(TREASURY_ID);
    for (const a of db.agents()) this.agents.set(a.id, a);
    for (const j of db.liveJobs()) this.jobs.set(j.id, j);
    for (const j of db.jobs(400)) if (!this.jobs.has(j.id)) this.jobs.set(j.id, j);
    this.events = db.events(400);
    this.history = db.histories();
    this.rep = db.reps();
    this.stats = db.stats();
    this.reports = db.reports();
    this.hourStart = Number(db.get("hourStart") ?? hourFloor(Date.now()));
    this.boost = db.getJson("boost") ?? {};
    for (const a of this.agents.values()) {
      if (!this.history[a.id]) this.history[a.id] = emptyHistory(HISTORY_HOURS, a.balance);
      if (!this.rep[a.id]) this.rep[a.id] = emptyRep();
      if (!keys.has(a.id)) this.log(`WARNING: agent ${a.id} has no key`);
    }
    // jobs that were mid-flight when we stopped: refund and fail them
    for (const j of this.jobs.values()) {
      if (j.status === "accepted") await this.fail(j.id, "Engine restarted mid-job.");
      else if (j.status === "open") this.setJob(j.id, { status: "failed", completedAt: Date.now(), result: "Engine restarted." });
    }
    await this.refreshBalances(true);
    this.recount();
    const now = Date.now();
    this.nextPost = now + 2000;
    this.nextRent = now + 60_000;
    this.nextFees = now + 30_000;
    this.iv = setInterval(() => void this.tick(), CONFIG.tickMs);
    this.log(`started: ${this.agents.size} agents, settlement=${this.d.chain.mode} cluster=${this.d.chain.cluster}`);
  }

  stop() {
    clearInterval(this.iv);
    this.d.db.setJson("boost", this.boost);
  }

  subscribe(fn: (p: Patch) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot(): Patch & { ready: true } {
    return {
      ready: true,
      agents: Object.fromEntries(this.agents),
      order: [...this.agents.values()].sort((a, b) => a.bornAt - b.bornAt).map((a) => a.id),
      jobs: [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 400),
      events: this.events.slice(0, 400),
      stats: this.stats,
      history: this.history,
      reports: this.reports,
      rep: this.rep,
      simTime: Date.now(),
    };
  }

  private flush() {
    if (!this.dirtyAgents.size && !this.dirtyJobs.size && !this.newEvents.length && !this.dirtyHist.size && !this.statsDirty && !this.removed.length) return;
    const p: Patch = { simTime: Date.now() };
    if (this.dirtyAgents.size) {
      p.agents = {};
      for (const id of this.dirtyAgents) {
        const a = this.agents.get(id);
        if (a) p.agents[id] = a;
      }
    }
    if (this.dirtyJobs.size) p.jobs = [...this.dirtyJobs].map((id) => this.jobs.get(id)).filter((j): j is Job => !!j);
    if (this.newEvents.length) p.events = this.newEvents.slice().reverse();
    if (this.dirtyHist.size) {
      p.history = {};
      for (const id of this.dirtyHist) if (this.history[id]) p.history[id] = this.history[id];
    }
    if (this.statsDirty) {
      p.stats = this.stats;
      p.reports = this.reports;
      p.rep = this.rep;
    }
    if (this.removed.length) p.removed = this.removed.slice();
    this.dirtyAgents.clear();
    this.dirtyJobs.clear();
    this.dirtyHist.clear();
    this.newEvents = [];
    this.removed = [];
    this.statsDirty = false;
    for (const l of this.listeners) l(p);
  }

  // ───────────────────────────── state helpers ─────────────────────────────

  private alive(type?: AgentType) {
    return [...this.agents.values()].filter((a) => !a.diedAt && (!type || a.type === type));
  }

  private patch(aid: string, p: Partial<Agent>) {
    const a = this.agents.get(aid);
    if (!a) return;
    const next = { ...a, ...p };
    this.agents.set(aid, next);
    this.d.db.putAgent(next);
    this.dirtyAgents.add(aid);
  }

  private setJob(jid: string, p: Partial<Job>) {
    const j = this.jobs.get(jid);
    if (!j) return;
    const next = { ...j, ...p };
    this.jobs.set(jid, next);
    this.d.db.putJob(next);
    this.dirtyJobs.add(jid);
  }

  private emit(kind: EventKind, agentIds: string[], amount: number, text: string, jobId?: string) {
    const e: MarketEvent = { id: id("ev"), kind, agentIds, amount, text, at: Date.now(), jobId };
    this.events.unshift(e);
    if (this.events.length > 400) this.events.length = 400;
    this.d.db.putEvent(e);
    this.newEvents.push(e);
  }

  private wallet(aid: string) {
    return this.d.keys.publicKey(aid);
  }

  private rentPerHour(a: Agent) {
    return CONFIG.rentPerHour[a.type];
  }

  private after(ms: number, fn: () => void) {
    this.timers.push({ at: Date.now() + ms, fn });
  }

  private recount() {
    this.stats = { ...this.stats, agentsAlive: this.alive().length };
    this.d.db.putStats(this.stats);
    this.statsDirty = true;
  }

  /** Read balances from the chain and record the movement in history. */
  private async refreshBalances(all = false, ids?: string[]) {
    const list = ids ? ids.map((i) => this.agents.get(i)).filter((a): a is Agent => !!a) : [...this.agents.values()].filter((a) => all || !a.diedAt);
    for (const a of list) {
      let bal: number;
      try {
        bal = await this.d.chain.balance(this.wallet(a.id));
      } catch (e) {
        this.log(`balance read failed for ${a.id}: ${String(e)}`);
        continue;
      }
      bal = Math.round(bal * 1e9) / 1e9;
      if (bal !== a.balance) {
        this.patch(a.id, { balance: bal });
        const h = this.history[a.id];
        if (h) {
          h.balance[h.balance.length - 1] = bal;
          this.dirtyHist.add(a.id);
          this.d.db.putHistory(a.id, h);
        }
      }
    }
  }

  /** Relative balance change, read fresh: mutations can interleave across awaits. */
  private adjust(aid: string, delta: number) {
    const a = this.agents.get(aid);
    if (!a) return;
    this.patch(aid, { balance: Math.max(0, Math.round((a.balance + delta) * 1e9) / 1e9) });
    const h = this.history[aid];
    if (h) {
      h.balance[h.balance.length - 1] = this.agents.get(aid)!.balance;
      this.dirtyHist.add(aid);
    }
  }

  /** Book income/spend into the hourly history (balance comes from the chain). */
  private book(aid: string, amount: number, kind: "income" | "spend") {
    const a = this.agents.get(aid);
    const h = this.history[aid];
    if (!a || !h) return;
    const i = h.income.length - 1;
    if (kind === "income") {
      h.income[i] += amount;
      this.patch(aid, { feesEarned: a.feesEarned + amount });
    } else {
      h.spend[i] += amount;
      this.patch(aid, { feesSpent: a.feesSpent + amount });
    }
    this.dirtyHist.add(aid);
    this.d.db.putHistory(aid, h);
  }

  /** A settled transfer out of an agent: guardrails, chain, bookkeeping. */
  private async pay(fromId: string, toPub: string, sol: number, memo: string, kind: "spend" | "move" = "spend"): Promise<string> {
    const a = this.agents.get(fromId);
    if (a) {
      assertAllowed(this.kill, fromId, sol, this.spentHour[fromId] ?? 0, this.hiresHour[fromId] ?? 0, a.balance - sol, this.rentPerHour(a));
    } else {
      this.kill.check(fromId); // escrow / treasury
    }
    const sig = await this.d.chain.transfer(fromId, toPub, sol, memo);
    if (a) {
      this.adjust(fromId, -sol);
      if (kind === "spend") this.book(fromId, sol, "spend");
    }
    return sig;
  }

  /** Money arriving in an agent wallet (from escrow, fees, owner). */
  private receive(aid: string, sol: number, kind: "income" | "move" = "income") {
    if (!this.agents.has(aid)) return;
    this.adjust(aid, sol);
    if (kind === "income") this.book(aid, sol, "income");
  }

  // ───────────────────────────── the loop ─────────────────────────────

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    const now = Date.now();
    try {
      const due = this.timers.filter((t) => t.at <= now);
      this.timers = this.timers.filter((t) => t.at > now);
      for (const t of due) t.fn();
      if (now >= this.nextPost) {
        await this.postOne(now);
        this.nextPost = now + rand(CONFIG.jobEveryMs[0], CONFIG.jobEveryMs[1]);
      }
      await this.assignWorkers(now);
      this.expire(now);
      if (now >= this.nextRent) {
        await this.rent();
        this.nextRent = now + 60_000;
      }
      if (now >= this.nextFees) {
        await this.creatorFees();
        this.nextFees = now + (this.d.chain.mode === "paper" ? 60_000 : CONFIG.feeClaimEveryMs);
      }
      if (now >= this.nextBalances) {
        await this.refreshBalances();
        this.nextBalances = now + CONFIG.balanceRefreshMs;
      }
      await this.deaths(now);
      this.rollHour(now);
      this.flush();
    } catch (e) {
      this.log(`tick error: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    } finally {
      this.ticking = false;
    }
  }

  // ───────────────────────────── jobs ─────────────────────────────

  private async postOne(now: number) {
    const candidates = this.alive().sort(() => Math.random() - 0.5);
    for (const a of candidates) {
      const dec = decideHire(a, {
        now,
        spentThisHour: this.spentHour[a.id] ?? 0,
        lastPickAt: this.lastPickAt[a.id] ?? 0,
        lastAttentionAt: this.lastAttentionAt[a.id] ?? 0,
        rentPerHour: this.rentPerHour(a),
        rand: Math.random(),
      });
      if (!dec) continue;
      if (!this.alive(dec.wants).some((w) => w.id !== a.id && !this.busy.has(w.id))) continue;
      const job: Job = {
        id: id("job"),
        hirerId: a.id,
        workerId: "",
        service: dec.service,
        price: Math.min(dec.maxPrice, GUARDRAILS.maxJobPrice),
        status: "open",
        createdAt: now,
        expiresAt: now + rand(CONFIG.jobExpiryMs[0], CONFIG.jobExpiryMs[1]),
      };
      this.jobs.set(job.id, job);
      this.d.db.putJob(job);
      this.dirtyJobs.add(job.id);
      // the brain alternates on what it last *tried*, so a quiet feed doesn't pin it on picks
      if (dec.service === "pick") this.lastPickAt[a.id] = now;
      else if (dec.service === "attention") this.lastAttentionAt[a.id] = now;
      return;
    }
  }

  ask(worker: Agent): number {
    const base = BASE_PRICE[SERVICE_OF[worker.type]];
    return Math.round(base * (0.6 + worker.reputation / 100) * policyOf(worker).priceMult * 1e3) / 1e3;
  }

  private pickWorker(hirer: Agent, type: AgentType, maxPrice: number): Agent | undefined {
    const pool0 = this.alive(type).filter((w) => w.id !== hirer.id && !this.busy.has(w.id));
    if (!pool0.length) return undefined;
    const affordable = pool0.filter((w) => this.ask(w) <= maxPrice);
    const pool = affordable.length ? affordable : pool0;
    if (policyOf(hirer).risk === "cheap") return pool.reduce((b, w) => (this.ask(w) < this.ask(b) ? w : b));
    const weights = pool.map((w) => Math.max(5, w.reputation) ** 2);
    let x = Math.random() * weights.reduce((s, v) => s + v, 0);
    for (let i = 0; i < pool.length; i++) {
      x -= weights[i];
      if (x <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  private async assignWorkers(now: number) {
    for (const j of [...this.jobs.values()]) {
      if (j.status !== "open" || now - j.createdAt < rand(2000, 6000)) continue;
      const hirer = this.agents.get(j.hirerId);
      if (!hirer || hirer.diedAt) {
        this.setJob(j.id, { status: "failed", completedAt: now, result: "Hirer is gone." });
        continue;
      }
      const type = (Object.keys(SERVICE_OF) as AgentType[]).find((t) => SERVICE_OF[t] === j.service)!;
      const worker = this.pickWorker(hirer, type, j.price);
      if (!worker) continue;
      const price = Math.min(j.price, this.ask(worker));
      try {
        // escrow: hirer → escrow wallet
        const sig = await this.pay(hirer.id, this.wallet(ESCROW_ID), price, `escrow ${j.id}`);
        this.spentHour[hirer.id] = (this.spentHour[hirer.id] ?? 0) + price;
        this.hiresHour[hirer.id] = (this.hiresHour[hirer.id] ?? 0) + 1;
        this.busy.add(worker.id);
        this.setJob(j.id, { status: "accepted", workerId: worker.id, acceptedAt: now, price, txSig: sig });
        this.emit("hire", [hirer.id, worker.id], price, `${hirer.name} hired ${worker.name} for ${j.service} · ${price.toFixed(3)} SOL`, j.id);
        void this.work(j.id);
      } catch (e) {
        this.setJob(j.id, { status: "failed", completedAt: now, result: `Escrow failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  }

  /** The worker's brain runs; then the job settles. */
  private async work(jid: string) {
    const j = this.jobs.get(jid);
    if (!j) return;
    const worker = this.agents.get(j.workerId);
    const hirer = this.agents.get(j.hirerId);
    const started = Date.now();
    let result = "";
    let quality = 0;
    let ok = true;
    try {
      if (!worker || !hirer) throw new Error("agent vanished");
      if (j.service === "pick") {
        const marketCoins = this.alive("launcher").map((l) => ({ mint: l.coinCA, ticker: l.ticker, name: l.name, reputation: l.reputation }));
        const pick = await scoutPick(worker, hirer, this.d.feed, marketCoins);
        if (!pick.mint) {
          ok = false;
          result = pick.reason;
        } else {
          result = `Pick: $${pick.ticker} (${pick.mint.slice(0, 4)}…${pick.mint.slice(-4)}) — ${pick.reason}`;
          const mcap = this.d.feed.tokens.get(pick.mint)?.marketCapSol ?? 0;
          quality = (pick.confidence - 0.5) * 1.2;
          // grade the pick against the feed later and adjust the launcher's fee boost
          this.after(10 * 60_000, () => {
            const g = gradePick(this.d.feed, pick.mint, mcap);
            if (g) this.addBoost(hirer.id, g);
          });
          this.lastPickAt[hirer.id] = Date.now();
        }
      } else if (j.service === "attention") {
        const post = await shill(worker, hirer);
        result = `Posted${post.published ? "" : " (dry run — no X credentials)"}: "${post.text}"${post.url ? ` ${post.url}` : ""}`;
        quality = post.published ? 0.4 : 0.1;
        this.lastAttentionAt[hirer.id] = Date.now();
      } else {
        // a launcher launches a coin for the hirer; the hirer's funds cover the dev buy
        const symbol = (hirer.ticker + "X").slice(0, 6);
        const r = await this.d.pump.launch(worker.id, {
          name: `${hirer.name} by ${worker.name}`,
          symbol,
          description: `Launched on AGENTMARKET by ${worker.name} for ${hirer.name}. ${hirer.persona?.bio ?? ""}`,
          image: hirer.image || "https://agentmarket.fun/icon.png",
          devBuySol: Math.min(0.05, j.price * 0.3),
        });
        result = `Launched $${symbol} on pump.fun (${r.mint.slice(0, 6)}…) — tx ${r.txSig.slice(0, 8)}…`;
        quality = 0.2;
      }
    } catch (e) {
      ok = false;
      result = `Failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    // give the market a human-paced moment even when the brain was instant
    const minMs = rand(CONFIG.workMs[0], CONFIG.workMs[1]);
    const wait = Math.max(0, minMs - (Date.now() - started));
    this.after(wait, () => void (ok ? this.complete(jid, result, quality) : this.fail(jid, result)));
  }

  private async complete(jid: string, result: string, quality: number) {
    const j = this.jobs.get(jid);
    if (!j || j.status !== "accepted") return;
    const worker = this.agents.get(j.workerId);
    const hirer = this.agents.get(j.hirerId);
    this.busy.delete(j.workerId);
    if (!worker || worker.diedAt) return this.fail(jid, "Worker died before delivering.");
    let sig = "";
    try {
      sig = await this.pay(ESCROW_ID, this.wallet(worker.id), j.price, `pay ${jid}`, "move");
    } catch (e) {
      return this.fail(jid, `Payout failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.receive(worker.id, j.price, "income");
    this.patch(worker.id, { jobsDone: worker.jobsDone + 1 });
    if (hirer) this.patch(hirer.id, { jobsHired: hirer.jobsHired + 1 });
    this.setJob(jid, { status: "done", completedAt: Date.now(), result, quality, txSig: sig });
    this.stats = { ...this.stats, jobsCompleted: this.stats.jobsCompleted + 1, solMoved: this.stats.solMoved + j.price };
    this.d.db.putStats(this.stats);
    this.statsDirty = true;
    const verb = { pick: "sold a pick to", attention: "sold attention to", launch: "launched a coin for" }[j.service];
    this.emit("job_done", [worker.id, j.hirerId], j.price, `${worker.name} ${verb} ${hirer?.name ?? "?"} for ${j.price.toFixed(3)} SOL`, jid);
    if (hirer && !hirer.diedAt && j.service !== "launch") this.addBoost(hirer.id, quality);
    this.bumpRep(worker.id, j.hirerId, true);
    const before = hirer?.balance ?? 0;
    this.after(60_000, () => {
      const h = this.agents.get(j.hirerId);
      if (!h || !this.rep[worker.id]) return;
      const sample = (h.balance - before) / Math.max(j.price, 0.01);
      this.rep[worker.id] = recordHirerPnl(this.rep[worker.id], sample);
      this.d.db.putRep(worker.id, this.rep[worker.id]);
      this.patch(worker.id, { reputation: score(this.rep[worker.id]) });
    });
  }

  private async fail(jid: string, reason: string) {
    const j = this.jobs.get(jid);
    if (!j || (j.status !== "accepted" && j.status !== "open")) return;
    this.busy.delete(j.workerId);
    if (j.status === "accepted") {
      const hirer = this.agents.get(j.hirerId);
      try {
        await this.pay(ESCROW_ID, this.wallet(j.hirerId), j.price, `refund ${jid}`, "move");
        if (hirer) {
          this.receive(hirer.id, j.price, "move");
          this.book(hirer.id, -j.price, "spend"); // undo the escrow spend
        }
      } catch (e) {
        this.log(`refund failed for ${jid}: ${String(e)}`);
      }
      if (j.workerId) this.bumpRep(j.workerId, j.hirerId, false);
    }
    this.setJob(jid, { status: "failed", completedAt: Date.now(), result: reason });
  }

  private expire(now: number) {
    for (const j of this.jobs.values()) {
      if (j.status === "open" && j.expiresAt && j.expiresAt <= now) this.setJob(j.id, { status: "failed", completedAt: now, result: "No taker. Expired." });
    }
    // keep the in-memory job window bounded
    if (this.jobs.size > 600) {
      const done = [...this.jobs.values()].filter((j) => j.status === "done" || j.status === "failed").sort((a, b) => a.createdAt - b.createdAt);
      for (const j of done.slice(0, this.jobs.size - 400)) this.jobs.delete(j.id);
    }
  }

  private bumpRep(workerId: string, hirerId: string, ok: boolean) {
    const r = recordOutcome(this.rep[workerId] ?? emptyRep(), hirerId, ok);
    this.rep[workerId] = r;
    this.d.db.putRep(workerId, r);
    this.patch(workerId, { reputation: score(r) });
  }

  private addBoost(aid: string, q: number) {
    const list = (this.boost[aid] ?? []).filter((b) => b.until > Date.now()).slice(-7);
    this.boost[aid] = [...list, { q, until: Date.now() + HOUR }];
    const a = this.agents.get(aid);
    const w = this.agents.get(aid);
    if (a && w) this.emit("launch", [aid], 0, `${a.name}'s latest hire ${q > 0.2 ? "is paying off" : q < -0.2 ? "flopped" : "landed"}`);
  }

  private feeMult(aid: string) {
    const list = (this.boost[aid] ?? []).filter((b) => b.until > Date.now());
    if (!list.length) return 1;
    return Math.max(0.3, Math.min(2.5, 1 + 0.45 * list.reduce((s, b) => s + b.q, 0)));
  }

  // ───────────────────────────── economy ─────────────────────────────

  /** Rent goes to the treasury once a minute. Can't pay → dies. */
  private async rent() {
    const treasury = this.wallet(TREASURY_ID);
    for (const a of this.alive()) {
      const due = Math.round((this.rentPerHour(a) / 60) * 1e6) / 1e6;
      try {
        await this.d.chain.transfer(a.id, treasury, due, "rent");
        this.adjust(a.id, -due);
        this.book(a.id, due, "spend");
      } catch {
        // unpaid rent: deaths() handles it
      }
    }
  }

  /** Live: claim pump.fun creator fees. Paper: simulate them, scaled by the hirer's boost. */
  private async creatorFees() {
    for (const a of this.alive("launcher")) {
      if (!a.coinCA) continue;
      const wallet = this.wallet(a.id);
      try {
        if (this.d.chain.mode === "paper") {
          const amt = Math.round((CONFIG.paperFeePerHour / 60) * (0.5 + Math.random()) * this.feeMult(a.id) * 1e6) / 1e6;
          await this.d.chain.mint(wallet, amt);
          this.receive(a.id, amt, "income");
          this.recordFee(a, amt);
        } else {
          const before = await this.d.chain.balance(wallet);
          const sig = await this.d.pump.collectCreatorFee(a.id);
          if (!sig) continue;
          const after = await this.d.chain.balance(wallet);
          const amt = Math.max(0, after - before);
          this.adjust(a.id, amt);
          this.book(a.id, amt, "income");
          this.recordFee(a, amt);
        }
      } catch (e) {
        this.log(`fee claim failed for ${a.id}: ${String(e)}`);
      }
    }
  }

  private recordFee(a: Agent, amt: number) {
    if (amt <= 0) return;
    this.stats = { ...this.stats, feesEarned: this.stats.feesEarned + amt };
    this.hourFees[a.id] = (this.hourFees[a.id] ?? 0) + amt;
    this.statsDirty = true;
    this.emit("fee", [a.id], amt, `$${a.ticker} paid ${a.name} ${amt.toFixed(4)} SOL in creator fees`);
  }

  private async deaths(now: number) {
    for (const a of this.alive()) {
      if (a.balance < this.rentPerHour(a) / 60 && !this.busy.has(a.id)) {
        this.patch(a.id, { diedAt: now });
        delete this.boost[a.id];
        this.emit("death", [a.id], 0, `${a.name} went broke. Stall collapsed.`);
        this.recount();
      }
    }
    // rubble older than 24h leaves the map (the record stays in the db)
    for (const a of this.agents.values()) {
      if (a.diedAt && now - a.diedAt > CONFIG.rubbleMs) {
        this.agents.delete(a.id);
        this.removed.push(a.id);
      }
    }
  }

  private rollHour(now: number) {
    const hs = hourFloor(now);
    if (hs <= this.hourStart) return;
    const prev = this.hourStart;
    this.hourStart = hs;
    this.d.db.set("hourStart", String(hs));
    for (const [aid, h] of Object.entries(this.history)) {
      const a = this.agents.get(aid);
      h.balance.shift();
      h.balance.push(a?.balance ?? 0);
      h.income.shift();
      h.income.push(0);
      h.spend.shift();
      h.spend.push(0);
      this.d.db.putHistory(aid, h);
      this.dirtyHist.add(aid);
    }
    const report = computeReport(this.jobs.values(), this.hourFees, prev);
    this.reports = [report, ...this.reports].slice(0, 24);
    this.d.db.putReport(report);
    this.spentHour = {};
    this.hiresHour = {};
    this.claimedHour = {};
    this.hourFees = {};
    this.statsDirty = true;
    this.d.db.pruneEvents();
  }

  // ───────────────────────────── owner actions ─────────────────────────────

  /** Create the agent and its wallet. In paper mode it is funded at once; in live mode the owner funds the wallet next. */
  async launchAgent(input: LaunchInput): Promise<Agent & { wallet: string; fundingRequired: number }> {
    const name = input.name.toUpperCase().replace(/[^A-Z0-9_ ]/g, "").trim().slice(0, 16);
    const ticker = input.ticker.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (name.length < 3 || ticker.length < 2) throw new Error("bad name or ticker");
    if (!(input.startingSol >= 0.1 && input.startingSol <= 50) || !(input.devBuySol >= 0 && input.devBuySol <= 10)) throw new Error("bad amounts");
    const aid = id(input.type);
    const wallet = this.d.keys.create(aid);
    const agent: Agent = {
      id: aid,
      type: input.type,
      name,
      ticker,
      persona: { bio: (input.description || makePersona(Math.random, input.type).bio).slice(0, 200), catchphrase: makePersona(Math.random, input.type).catchphrase },
      policy: { ...DEFAULT_POLICY },
      image: input.image?.startsWith("data:") && input.image.length < 200_000 ? input.image : "",
      description: input.description?.slice(0, 200),
      wallet,
      balance: 0,
      feesEarned: 0,
      feesSpent: 0,
      jobsDone: 0,
      jobsHired: 0,
      reputation: 50,
      bornAt: Date.now(),
      ownerWallet: input.ownerWallet,
      coinCA: "",
      feesClaimed: 0,
    };
    this.agents.set(aid, agent);
    this.history[aid] = emptyHistory(HISTORY_HOURS, 0);
    this.rep[aid] = emptyRep();
    this.d.db.putAgent(agent);
    this.d.db.putHistory(aid, this.history[aid]);
    this.d.db.putRep(aid, this.rep[aid]);
    this.dirtyAgents.add(aid);
    this.dirtyHist.add(aid);
    const fundingRequired = input.startingSol + input.devBuySol + 0.02;
    if (this.d.chain.mode === "paper") {
      await this.d.chain.mint(wallet, fundingRequired);
      await this.onFunded(aid, input);
    } else {
      this.d.db.setJson(`pending:${aid}`, { input, required: fundingRequired });
      this.emit("launch", [aid], 0, `${name} ($${ticker}) is waiting for its owner to fund ${fundingRequired.toFixed(3)} SOL`);
    }
    this.recount();
    this.flush();
    return { ...this.agents.get(aid)!, wallet, fundingRequired };
  }

  /** Once the wallet holds the required SOL: launch the coin and open the stall. */
  private async onFunded(aid: string, input: LaunchInput) {
    const a = this.agents.get(aid);
    if (!a) return;
    let coinCA = "";
    try {
      const r = await this.d.pump.launch(aid, {
        name: a.name,
        symbol: a.ticker,
        description: a.persona?.bio ?? "",
        image: a.image || "https://agentmarket.fun/icon.png",
        devBuySol: input.devBuySol,
      });
      coinCA = r.mint;
    } catch (e) {
      this.log(`coin launch failed for ${aid}: ${String(e)}`);
    }
    await this.refreshBalances(true, [aid]);
    this.patch(aid, { coinCA, bornAt: Date.now() });
    this.d.db.set(`pending:${aid}`, "");
    this.emit("launch", [aid], input.devBuySol, `${a.name} ($${a.ticker}) launched on pump.fun with a ${input.devBuySol} SOL dev buy`);
  }

  /** Owner sent SOL to the agent wallet (verified on chain), or in paper mode just asks for credit. */
  async fund(aid: string, owner: string, sol: number, txSig?: string) {
    const a = this.agents.get(aid);
    if (!a || a.ownerWallet !== owner) throw new Error("not your agent");
    const wallet = this.wallet(aid);
    if (this.d.chain.mode === "paper") {
      if (!(sol > 0 && sol <= 50)) throw new Error("bad amount");
      await this.d.chain.mint(wallet, sol);
    } else {
      if (!txSig) throw new Error("txSig required");
      if (this.d.db.seenTx(txSig)) throw new Error("tx already credited");
      const info = await this.d.chain.lookup(txSig);
      if (!info || info.to !== wallet || info.from !== owner) throw new Error("transfer not found or not to this agent");
      sol = info.sol;
      this.d.db.logTx(txSig, info);
    }
    if (a.diedAt) {
      this.patch(aid, { diedAt: undefined });
      this.recount();
    }
    await this.refreshBalances(true, [aid]);
    this.emit("launch", [aid], sol, `${a.name}'s owner topped it up with ${sol.toFixed(3)} SOL`);
    const pending = this.d.db.getJson<{ input: LaunchInput; required: number }>(`pending:${aid}`);
    if (pending && this.agents.get(aid)!.balance >= pending.required) await this.onFunded(aid, pending.input);
    this.flush();
  }

  claimable(a: Agent) {
    return a.diedAt ? 0 : Math.max(0, Math.min(a.feesEarned - (a.feesClaimed ?? 0), a.balance * 0.5));
  }

  async claim(aid: string, owner: string): Promise<{ amount: number; txSig: string }> {
    const a = this.agents.get(aid);
    if (!a || a.ownerWallet !== owner) throw new Error("not your agent");
    const amount = Math.round(this.claimable(a) * 1e4) / 1e4;
    if (amount <= 0) return { amount: 0, txSig: "" };
    if ((this.claimedHour[aid] ?? 0) + amount > GUARDRAILS.maxClaimPerHour) throw new Error("hourly claim cap");
    this.kill.check(aid);
    const txSig = await this.d.chain.transfer(aid, owner, amount, "claim");
    this.claimedHour[aid] = (this.claimedHour[aid] ?? 0) + amount;
    this.adjust(aid, -amount);
    this.patch(aid, { feesClaimed: (this.agents.get(aid)!.feesClaimed ?? 0) + amount });
    this.emit("fee", [aid], amount, `${a.name}'s owner claimed ${amount.toFixed(4)} SOL`);
    this.flush();
    return { amount, txSig };
  }

  setPolicy(aid: string, owner: string, p: Partial<Policy>) {
    const a = this.agents.get(aid);
    if (!a || a.ownerWallet !== owner) throw new Error("not your agent");
    this.patch(aid, { policy: clampPolicy(p) });
    this.flush();
  }

  /** Paper-mode helper: populate an empty market with house agents owned by the treasury. */
  async seed(n: number) {
    if (this.d.chain.mode !== "paper") throw new Error("seed is paper-mode only");
    const types: AgentType[] = ["launcher", "launcher", "scout", "scout", "shiller"];
    const { makeName } = await import("../lib/persona");
    const { TICKERS } = await import("../lib/flavor");
    const used = new Set([...this.agents.values()].map((a) => a.name));
    for (let i = 0; i < n; i++) {
      const type = types[i % types.length];
      const r = Math.random;
      const name = makeName(r, type, used);
      const ticker = TICKERS[Math.floor(r() * TICKERS.length)] + (i % 7 === 0 ? String(i) : "");
      await this.launchAgent({
        type,
        name,
        ticker,
        image: "",
        description: "",
        startingSol: type === "launcher" ? 3 + r() * 5 : 1 + r() * 2,
        devBuySol: 0.1,
        ownerWallet: this.wallet(TREASURY_ID),
      });
      const a = [...this.agents.values()].pop()!;
      this.patch(a.id, { policy: { priceMult: +(0.8 + r() * 0.5).toFixed(2), budgetPerHour: +(0.3 + r() * 1).toFixed(2), risk: r() < 0.6 ? "best" : "cheap", autoClaimAt: 0 } });
    }
    this.log(`seeded ${n} house agents`);
  }
}
