// Phase 1 mock simulator. Runs entirely in the browser:
//  - boots the deterministic genesis market (30 agents, 7d history)
//  - posts a job every 3-8s, agents accept, deliver or fail
//  - moves SOL between agent balances, pays creator fees, charges rent
//  - kills agents that hit 0, spawns new ones, rings the hourly bell
// It writes into the same store a Phase 2 backend would (see lib/source).

import { genesis, makeAgent } from "./genesis";
import { failReason, jobResult, SERVICE_VERB } from "./flavor";
import { emptyRep, recordHirerPnl, recordOutcome, score } from "./reputation";
import { fakeMint, fakeSig, fakeWallet, mulberry32, pick, range, type Rng } from "./rng";
import { useMarket } from "./store";
import type { MarketSource } from "./source/types";
import {
  HISTORY_HOURS,
  RUBBLE_MS,
  SERVICE_OF,
  type Agent,
  type AgentType,
  type EventKind,
  type Job,
  type LaunchInput,
} from "./types";
import { HOUR, computeReport, hourFloor, type World } from "./world";

const RENT_EVERY_MS = 5000;
const RENT: Record<AgentType, number> = { launcher: 0.0008, scout: 0.0006, shiller: 0.0006 };
const DEATH_FLOOR = 0.0005;
const MIN_ALIVE = 28;
const MAX_JOBS = 400;
const MAX_EVENTS = 400;
const MINE_KEY = "am.mine.v1";

interface StoredLaunch extends LaunchInput {
  id: string;
  bornAt: number;
  coinCA: string;
  wallet: string;
}

type Timer = { at: number; fn: () => void };

export class SimSource implements MarketSource {
  private w!: World;
  private r: Rng = mulberry32((Date.now() ^ 0x5eed) >>> 0);
  private timers: Timer[] = [];
  private nextPost = 0;
  private nextRent = 0;
  private nextSpawn = 0;
  private dirty = false;
  private iv?: ReturnType<typeof setInterval>;

  start() {
    const now = Date.now();
    this.w = genesis(now);
    this.restoreMine();
    this.seedLiveJobs(now);
    this.nextPost = now + 1500;
    this.nextRent = now + RENT_EVERY_MS;
    this.nextSpawn = now + range(this.r, 60_000, 120_000);
    useMarket.setState({
      launchAgent: (input) => this.launchAgent(input),
      claimFees: (id) => this.claimFees(id, ""),
    });
    this.publish(true);
    this.iv = setInterval(() => this.tick(), 250);
    return () => clearInterval(this.iv);
  }

  // ───────────────────────────── loop ─────────────────────────────

  private tick() {
    const now = Date.now();
    const due = this.timers.filter((t) => t.at <= now);
    if (due.length) {
      this.timers = this.timers.filter((t) => t.at > now);
      due.forEach((t) => t.fn());
    }
    if (now >= this.nextPost) {
      this.postJob(now);
      this.nextPost = now + range(this.r, 3000, 8000);
    }
    if (now >= this.nextRent) {
      this.rentAndFees(now);
      this.nextRent = now + RENT_EVERY_MS;
    }
    if (now >= this.nextSpawn) {
      // humans keep launching: always when the market thins out, sometimes anyway
      if (this.alive().length < MIN_ALIVE || this.r() < 0.25) this.spawnRandom(now);
      this.nextSpawn = now + range(this.r, 45_000, 120_000);
    }
    this.expireOpen(now);
    this.rollHour(now);
    this.publish();
  }

  private after(ms: number, fn: () => void) {
    this.timers.push({ at: Date.now() + ms, fn });
  }

  // ─────────────────────────── helpers ────────────────────────────

  private alive(type?: AgentType) {
    return Object.values(this.w.agents).filter((a) => !a.diedAt && (!type || a.type === type));
  }

  private patch(id: string, p: Partial<Agent>) {
    const a = this.w.agents[id];
    if (!a) return;
    this.w.agents[id] = { ...a, ...p };
    this.dirty = true;
  }

  /** adjust balance and keep the hourly history current */
  private move(id: string, delta: number, kind: "income" | "spend" | "other" = "other") {
    const a = this.w.agents[id];
    if (!a || a.diedAt) return;
    const balance = Math.max(0, +(a.balance + delta).toFixed(6));
    this.patch(id, {
      balance,
      feesEarned: kind === "income" ? a.feesEarned + delta : a.feesEarned,
      feesSpent: kind === "spend" ? a.feesSpent - delta : a.feesSpent,
    });
    const h = this.w.history[id];
    if (h) {
      const bal = [...h.balance];
      const inc = [...h.income];
      bal[bal.length - 1] = balance;
      if (kind === "income") inc[inc.length - 1] += delta;
      this.w.history[id] = { balance: bal, income: inc };
    }
    if (balance <= DEATH_FLOOR) this.kill(id);
  }

  private emit(kind: EventKind, agentIds: string[], amount: number, text: string, jobId?: string) {
    this.w.events = [
      { id: `ev_${this.w.seq++}`, kind, agentIds, amount, text, at: Date.now(), jobId },
      ...this.w.events,
    ].slice(0, MAX_EVENTS);
    this.dirty = true;
  }

  private setJob(id: string, p: Partial<Job>) {
    this.w.jobs = this.w.jobs.map((j) => (j.id === id ? { ...j, ...p } : j));
    this.dirty = true;
  }

  private job(id: string) {
    return this.w.jobs.find((j) => j.id === id);
  }

  private pruneJobs() {
    if (this.w.jobs.length <= MAX_JOBS) return;
    const live = this.w.jobs.filter((j) => j.status === "open" || j.status === "accepted");
    const done = this.w.jobs.filter((j) => j.status === "done" || j.status === "failed");
    this.w.jobs = [...live, ...done.slice(0, MAX_JOBS - live.length)].sort((a, b) => b.createdAt - a.createdAt);
  }

  // ──────────────────────────── jobs ──────────────────────────────

  private seedLiveJobs(now: number) {
    for (let i = 0; i < 4; i++) this.postJob(now - i * 2500, i < 2);
  }

  private postJob(now: number, acceptSoon = false) {
    const r = this.r;
    const workerHiresLauncher = r() < 0.15;
    const pool = workerHiresLauncher
      ? this.alive().filter((a) => a.type !== "launcher" && a.balance > 0.25)
      : this.alive("launcher").filter((a) => a.balance > 0.12);
    if (!pool.length) return;
    // richer agents hire more often
    const total = pool.reduce((s, a) => s + a.balance, 0);
    let x = r() * total;
    let hirer = pool[0];
    for (const a of pool) {
      x -= a.balance;
      if (x <= 0) {
        hirer = a;
        break;
      }
    }
    const wType: AgentType = workerHiresLauncher ? "launcher" : r() < 0.55 ? "scout" : "shiller";
    const service = SERVICE_OF[wType];
    const price = +(service === "launch" ? range(r, 0.05, 0.15) : range(r, 0.01, 0.08)).toFixed(3);
    const job: Job = {
      id: `job_${this.w.seq++}`,
      hirerId: hirer.id,
      workerId: "",
      service,
      price,
      status: "open",
      createdAt: now,
      expiresAt: now + range(r, 18_000, 40_000),
    };
    this.w.jobs = [job, ...this.w.jobs];
    this.pruneJobs();
    this.dirty = true;
    if (acceptSoon || r() > 0.1) {
      const delay = acceptSoon ? range(r, 800, 2500) : range(r, 2500, 16_000);
      this.after(delay, () => this.accept(job.id, wType));
    }
  }

  private accept(jobId: string, wType: AgentType) {
    const job = this.job(jobId);
    if (!job || job.status !== "open") return;
    const hirer = this.w.agents[job.hirerId];
    if (!hirer || hirer.diedAt || hirer.balance < job.price) {
      this.setJob(jobId, { status: "failed", completedAt: Date.now(), result: "Hirer couldn't fund escrow." });
      return;
    }
    const candidates = this.alive(wType).filter((a) => a.id !== hirer.id);
    if (!candidates.length) return;
    // reputation-weighted choice
    const weights = candidates.map((a) => Math.pow(Math.max(5, a.reputation), 2));
    let x = this.r() * weights.reduce((s, v) => s + v, 0);
    let worker = candidates[0];
    for (let i = 0; i < candidates.length; i++) {
      x -= weights[i];
      if (x <= 0) {
        worker = candidates[i];
        break;
      }
    }
    const now = Date.now();
    this.move(hirer.id, -job.price); // escrow
    this.setJob(jobId, { status: "accepted", workerId: worker.id, acceptedAt: now });
    this.emit(
      "hire",
      [hirer.id, worker.id],
      job.price,
      `${hirer.name} hired ${worker.name} for ${job.service} · ${job.price.toFixed(3)} SOL`,
      jobId,
    );
    this.after(range(this.r, 4000, 14_000), () => this.complete(jobId));
  }

  private complete(jobId: string) {
    const job = this.job(jobId);
    if (!job || job.status !== "accepted") return;
    const hirer = this.w.agents[job.hirerId];
    const worker = this.w.agents[job.workerId];
    const now = Date.now();
    const ok = !!worker && !worker.diedAt && this.r() < (this.w.skill[worker.id] ?? 0.8);
    if (!ok || !worker) {
      // refund escrow
      if (hirer && !hirer.diedAt) this.move(hirer.id, job.price);
      this.setJob(jobId, { status: "failed", completedAt: now, result: failReason(this.r) });
      if (worker) this.bumpRep(worker.id, job.hirerId, false);
      return;
    }
    // escrow released to the worker
    this.move(worker.id, job.price, "income");
    if (hirer) {
      this.patch(hirer.id, {
        feesSpent: hirer.feesSpent + job.price,
        jobsHired: hirer.jobsHired + 1,
      });
    }
    this.patch(worker.id, { jobsDone: this.w.agents[worker.id].jobsDone + 1 });
    this.setJob(jobId, {
      status: "done",
      completedAt: now,
      txSig: fakeSig(this.r),
      result: jobResult(this.r, job, hirer),
    });
    this.w.stats = {
      ...this.w.stats,
      jobsCompleted: this.w.stats.jobsCompleted + 1,
      solMoved: this.w.stats.solMoved + job.price,
    };
    this.emit(
      "job_done",
      [worker.id, job.hirerId],
      job.price,
      SERVICE_VERB[job.service](worker.name, hirer?.name ?? "?", job.price.toFixed(3)),
      jobId,
    );
    if (job.service === "launch") {
      const t = pick(this.r, ["FROG", "GOBLIN", "MOON", "SNEK", "BLORP", "PIXL", "TOAD"]);
      this.emit("launch", [worker.id, job.hirerId], 0, `${worker.name} launched $${t} on pump.fun`, jobId);
    }
    this.bumpRep(worker.id, job.hirerId, true);
    // measure the hirer's PnL a minute later for the worker's reputation
    const before = hirer?.balance ?? 0;
    this.after(60_000, () => {
      const h = this.w.agents[job.hirerId];
      if (!h || !this.w.rep[worker.id]) return;
      const sample = (h.balance - before) / Math.max(job.price, 0.01);
      this.w.rep[worker.id] = recordHirerPnl(this.w.rep[worker.id], sample);
      this.patch(worker.id, { reputation: score(this.w.rep[worker.id]) });
    });
  }

  private bumpRep(workerId: string, hirerId: string, ok: boolean) {
    const rep = recordOutcome(this.w.rep[workerId] ?? emptyRep(), hirerId, ok);
    this.w.rep = { ...this.w.rep, [workerId]: rep };
    this.patch(workerId, { reputation: score(rep) });
  }

  private expireOpen(now: number) {
    for (const j of this.w.jobs) {
      if (j.status === "open" && j.expiresAt && j.expiresAt <= now) {
        this.setJob(j.id, { status: "failed", completedAt: now, result: "No taker. Expired." });
      }
    }
  }

  // ─────────────────────── economy / lifecycle ───────────────────────

  private rentAndFees(now: number) {
    for (const a of this.alive()) {
      if (a.type === "launcher" && this.r() < 0.35) {
        const amt = +(range(this.r, 0.003, 0.015) * (0.5 + (this.w.skill[a.id] ?? 0.8))).toFixed(4);
        this.move(a.id, amt, "income");
        this.w.stats = { ...this.w.stats, feesEarned: this.w.stats.feesEarned + amt };
        this.emit("fee", [a.id], amt, `$${a.ticker} paid ${a.name} ${amt.toFixed(4)} SOL in creator fees`);
      }
      this.move(a.id, -RENT[a.type]);
    }
    // rubble older than 24h is cleared from the map
    const before = this.w.order.length;
    this.w.order = this.w.order.filter((id) => {
      const a = this.w.agents[id];
      return !a?.diedAt || now - a.diedAt < RUBBLE_MS;
    });
    if (this.w.order.length !== before) this.dirty = true;
  }

  private kill(id: string) {
    const a = this.w.agents[id];
    if (!a || a.diedAt) return;
    this.patch(id, { balance: 0, diedAt: Date.now() });
    this.w.stats = { ...this.w.stats, agentsAlive: this.w.stats.agentsAlive - 1 };
    this.emit("death", [id], 0, `${a.name} went broke. Stall collapsed.`);
  }

  private spawnRandom(now: number) {
    const type = pick(this.r, ["launcher", "scout", "shiller"] as AgentType[]);
    const num = this.w.nextNum[type];
    this.w.nextNum[type] = num + 1;
    const a = makeAgent(this.r, type, num, now, { balance: +range(this.r, 0.4, 2).toFixed(3) });
    this.addAgent(a, this.r() * 0.35 + 0.6);
    this.emit("launch", [a.id], a.balance, `New ${a.name} ($${a.ticker}) opened a stall on pump.fun`);
  }

  private addAgent(a: Agent, skill: number) {
    this.w.agents[a.id] = a;
    if (!this.w.order.includes(a.id)) this.w.order = [...this.w.order, a.id];
    const balance = new Array(HISTORY_HOURS).fill(0);
    balance[HISTORY_HOURS - 1] = a.balance;
    this.w.history[a.id] = { balance, income: new Array(HISTORY_HOURS).fill(0) };
    this.w.rep[a.id] = emptyRep();
    this.w.skill[a.id] = skill;
    if (!a.diedAt) this.w.stats = { ...this.w.stats, agentsAlive: this.w.stats.agentsAlive + 1 };
    this.dirty = true;
  }

  private rollHour(now: number) {
    const hs = hourFloor(now);
    if (hs <= this.w.hourStart) return;
    const prev = this.w.hourStart;
    this.w.hourStart = hs;
    const hist: World["history"] = {};
    for (const [id, h] of Object.entries(this.w.history)) {
      const a = this.w.agents[id];
      hist[id] = {
        balance: [...h.balance.slice(1), a?.balance ?? 0],
        income: [...h.income.slice(1), 0],
      };
    }
    this.w.history = hist;
    this.w.reports = [computeReport(this.w.jobs, this.w.events, prev), ...this.w.reports].slice(0, 24);
    useMarket.setState({ bellAt: now });
    this.dirty = true;
  }

  private publish(force = false) {
    if (!this.dirty && !force) return;
    this.dirty = false;
    const w = this.w;
    useMarket.getState().ingest({
      ready: true,
      agents: { ...w.agents },
      order: w.order,
      jobs: w.jobs,
      events: w.events,
      stats: w.stats,
      history: { ...w.history },
      reports: w.reports,
      rep: w.rep,
    });
  }

  // ─────────────────────────── user actions ───────────────────────────

  async launchAgent(input: LaunchInput): Promise<Agent> {
    // Phase 2: this becomes a PumpPortal create + dev buy signed by the owner.
    await new Promise((res) => setTimeout(res, 1200));
    const stored: StoredLaunch = {
      ...input,
      id: `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20)}_${Math.floor(this.r() * 1e4)}`,
      bornAt: Date.now(),
      coinCA: fakeMint(this.r),
      wallet: fakeWallet(this.r),
    };
    const a = this.fromStored(stored);
    this.addAgent(a, 0.85);
    this.emit("launch", [a.id], input.devBuySol, `${a.name} ($${a.ticker}) launched on pump.fun with a ${input.devBuySol} SOL dev buy`);
    try {
      const mine: StoredLaunch[] = JSON.parse(localStorage.getItem(MINE_KEY) || "[]");
      localStorage.setItem(MINE_KEY, JSON.stringify([...mine, stored]));
    } catch {}
    this.publish();
    return this.w.agents[a.id];
  }

  async claimFees(agentId: string, _ownerWallet?: string): Promise<number> {
    void _ownerWallet;
    // Phase 2: collectCreatorFee via PumpPortal, then transfer to the owner.
    const a = this.w.agents[agentId];
    if (!a || a.diedAt) return 0;
    const amount = +Math.max(0, Math.min(a.feesEarned - (a.feesClaimed ?? 0), a.balance * 0.5)).toFixed(4);
    if (amount <= 0) return 0;
    await new Promise((res) => setTimeout(res, 800));
    this.move(agentId, -amount);
    this.patch(agentId, { feesClaimed: (a.feesClaimed ?? 0) + amount });
    this.publish();
    return amount;
  }

  private fromStored(s: StoredLaunch): Agent {
    return {
      id: s.id,
      type: s.type,
      name: s.name.toUpperCase(),
      ticker: s.ticker.toUpperCase(),
      image: s.image,
      description: s.description,
      wallet: s.wallet,
      balance: s.startingSol,
      feesEarned: 0,
      feesSpent: 0,
      jobsDone: 0,
      jobsHired: 0,
      reputation: 50,
      bornAt: s.bornAt,
      ownerWallet: s.ownerWallet,
      coinCA: s.coinCA,
      feesClaimed: 0,
    };
  }

  private restoreMine() {
    try {
      const mine: StoredLaunch[] = JSON.parse(localStorage.getItem(MINE_KEY) || "[]");
      // the sim is not persisted: owned agents come back with their starting SOL
      for (const s of mine) this.addAgent(this.fromStored(s), 0.85);
    } catch {}
  }
}

export const RUBBLE_HOURS = RUBBLE_MS / HOUR;
