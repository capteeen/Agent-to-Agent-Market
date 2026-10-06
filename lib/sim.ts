// Phase 1 mock simulator. Runs entirely in the browser, and every browser
// runs the *same* one:
//  - the world is seeded by the season number and stepped on a fixed tick
//    from the season start, so two visitors at the same moment see the same
//    agents, jobs, balances and deaths (no server needed)
//  - a job is posted every 3-8s; workers accept, deliver or fail; SOL moves
//    between agent balances; launchers earn creator fees; everyone pays rent
//  - pick/attention quality feeds back into the hirer's fee rate, so good
//    workers make their hirers richer (and get re-hired)
//  - agents that hit 0 die; new ones spawn; the hourly bell rings
// Agents launched in this browser are a local overlay with their own RNG.
// It writes into the same store a Phase 2 backend would (see lib/source).

import { genesis, makeAgent, randomPolicy } from "./genesis";
import { failReason, jobResult, SERVICE_VERB } from "./flavor";
import { makePersona } from "./persona";
import { emptyRep, recordHirerPnl, recordOutcome, score } from "./reputation";
import { fakeMint, fakeSig, fakeWallet, mulberry32, pick, range, type Rng } from "./rng";
import { useMarket } from "./store";
import type { MarketSource } from "./source/types";
import {
  DEFAULT_POLICY,
  HISTORY_HOURS,
  RUBBLE_MS,
  SERVICE_OF,
  type Agent,
  type AgentHistory,
  type AgentType,
  type EventKind,
  type Job,
  type LaunchInput,
  type Policy,
  type Service,
} from "./types";
import { HOUR, computeReport, emptyHistory, hourFloor, policyOf, seasonIndex, seasonStart, type World } from "./world";
import type { RepStats } from "./reputation";

export const TICK = 500;
const RENT_EVERY_MS = 5000;
const RENT: Record<AgentType, number> = { launcher: 0.0008, scout: 0.0006, shiller: 0.0006 };
const DEATH_FLOOR = 0.0005;
const MIN_ALIVE = 28;
const MAX_ALIVE = 36;
const MAX_JOBS = 400;
const MAX_EVENTS = 400;
const BASE_PRICE: Record<Service, number> = { pick: 0.035, attention: 0.03, launch: 0.09 };
const LOCAL_KEY = "am.local.v2";

interface LocalSave {
  agents: Agent[];
  history: Record<string, AgentHistory>;
  rep: Record<string, RepStats>;
  skill: Record<string, number>;
  savedAt: number;
}

type Timer = { at: number; fn: () => void };

export class SimSource implements MarketSource {
  w!: World;
  /** sim clock (ms). Advances in TICKs from the season start. */
  t = 0;
  private r: Rng = mulberry32(1);
  /** local-agent randomness: not shared, not deterministic */
  private rl: Rng = mulberry32((Date.now() ^ 0x5eed) >>> 0);
  private timers: Timer[] = [];
  private live = new Set<string>();
  private local = new Set<string>();
  private nextPost = 0;
  private nextRent = 0;
  private nextSpawn = 0;
  private nextLocalHire = 0;
  private nextSave = 0;
  private dirty = false;
  private dirtyHist = new Set<string>();
  private usedNames = new Set<string>();
  private usedTickers = new Set<string>();
  private iv?: ReturnType<typeof setInterval>;
  /** when true, publish() is a no-op (fast-forward) */
  private silent = false;
  private published: Record<string, AgentHistory> = {};

  /** Prepare the world at the season start. */
  private prepare(now: number) {
    this.w = genesis(now);
    const start = seasonStart(now);
    this.t = start;
    this.r = mulberry32((0xa11ce + seasonIndex(now)) >>> 0);
    for (const a of Object.values(this.w.agents)) {
      this.usedNames.add(a.name);
      this.usedTickers.add(a.ticker);
    }
    this.nextPost = start + 1500;
    this.nextRent = start + RENT_EVERY_MS;
    this.nextSpawn = start + 90_000;
    this.ffEnd = now;
    this.silent = true;
  }

  /** Build the world at `now` by replaying the season. Pure; used by tests and the server. */
  init(now: number) {
    this.prepare(now);
    while (this.t + TICK <= now) this.step();
    this.silent = false;
  }

  start() {
    this.prepare(Date.now());
    let stopped = false;
    const begin = this.t;
    // replay in slices so the page can paint a progress bar instead of freezing
    const slice = () => {
      if (stopped) return;
      const now = Date.now();
      const deadline = performance.now() + 40;
      while (this.t + TICK <= now && performance.now() < deadline) this.step();
      if (this.t + TICK <= now) {
        useMarket.setState({ progress: (this.t - begin) / Math.max(1, now - begin) });
        setTimeout(slice, 0);
        return;
      }
      this.silent = false;
      this.restoreLocal();
      this.nextLocalHire = this.t + 20_000;
      this.publish(true);
      this.iv = setInterval(() => this.sync(), 250);
    };
    useMarket.setState({
      launchAgent: (input) => this.launchAgent(input),
      claimFees: (id) => this.claimFees(id),
      fundAgent: (id, sol) => this.fundAgent(id, sol),
      setPolicy: (id, p) => this.setPolicy(id, p),
    });
    slice();
    return () => {
      stopped = true;
      clearInterval(this.iv);
    };
  }

  private sync() {
    const now = Date.now();
    let n = 0;
    while (this.t + TICK <= now && n++ < 4000) this.step();
    this.publish();
  }

  // ───────────────────────────── loop ─────────────────────────────

  /** Advance the world by one TICK. Deterministic. */
  step() {
    this.t += TICK;
    const t = this.t;
    if (this.timers.length && this.timers[0].at <= t) {
      const due: Timer[] = [];
      const keep: Timer[] = [];
      for (const x of this.timers) (x.at <= t ? due : keep).push(x);
      this.timers = keep;
      for (const x of due) x.fn();
    }
    if (t >= this.nextPost) {
      this.postJob();
      this.nextPost = t + range(this.r, 3000, 8000);
    }
    if (t >= this.nextRent) {
      this.rentAndFees();
      this.nextRent = t + RENT_EVERY_MS;
    }
    if (t >= this.nextSpawn) {
      // humans keep launching: always when the market thins out, sometimes anyway
      const n = this.alive().length;
      if (n < MIN_ALIVE || (n < MAX_ALIVE && this.r() < 0.25)) this.spawnRandom();
      this.nextSpawn = t + range(this.r, 45_000, 120_000);
    }
    if (this.local.size && t >= this.nextLocalHire) {
      this.localHires();
      this.nextLocalHire = t + range(this.rl, 25_000, 70_000);
    }
    this.expireOpen();
    this.rollHour();
  }

  private after(ms: number, fn: () => void) {
    const at = this.t + ms;
    // keep sorted by time so step() can short-circuit
    let i = this.timers.length;
    while (i > 0 && this.timers[i - 1].at > at) i--;
    this.timers.splice(i, 0, { at, fn });
  }

  // ─────────────────────────── helpers ────────────────────────────

  private alive(type?: AgentType, includeLocal = false) {
    const out: Agent[] = [];
    for (const id of this.w.order) {
      const a = this.w.agents[id];
      if (!a || a.diedAt || (type && a.type !== type) || (!includeLocal && a.local)) continue;
      out.push(a);
    }
    return out;
  }

  private rng(a: Agent | undefined) {
    return a?.local ? this.rl : this.r;
  }

  private patch(id: string, p: Partial<Agent>) {
    const a = this.w.agents[id];
    if (!a) return;
    // while fast-forwarding nobody is watching, so mutate in place (much cheaper)
    if (this.silent) Object.assign(a, p);
    else this.w.agents[id] = { ...a, ...p };
    this.dirty = true;
  }

  /** adjust balance and keep the hourly history current */
  private move(id: string, delta: number, kind: "income" | "spend" | "other" = "other") {
    const a = this.w.agents[id];
    if (!a || a.diedAt) return;
    const balance = Math.max(0, Math.round((a.balance + delta) * 1e6) / 1e6);
    this.patch(id, {
      balance,
      feesEarned: kind === "income" ? a.feesEarned + delta : a.feesEarned,
      feesSpent: kind === "spend" ? a.feesSpent - delta : a.feesSpent,
    });
    const h = this.w.history[id];
    if (h) {
      const i = h.balance.length - 1;
      h.balance[i] = balance;
      if (kind === "income") h.income[i] += delta;
      if (kind === "spend") h.spend[i] -= delta;
      this.dirtyHist.add(id);
    }
    if (balance <= DEATH_FLOOR) this.kill(id);
  }

  private lseq = 1;

  /** during fast-forward, events older than the window we keep are never materialised */
  private ffEnd = 0;

  private emit(kind: EventKind, agentIds: string[], amount: number, text: string, jobId?: string) {
    const isLocal = agentIds.some((id) => this.local.has(id));
    // ids are consumed even when the event is skipped, so job ids match across browsers
    const id = isLocal ? `lev_${this.lseq++}` : `ev_${this.w.seq++}`;
    if (this.silent && this.t < this.ffEnd - 3 * HOUR) return;
    this.w.events.push({ id, kind, agentIds, amount, text, at: this.t, jobId });
    if (this.w.events.length > MAX_EVENTS + 200) this.w.events.splice(0, this.w.events.length - MAX_EVENTS);
    this.dirty = true;
  }

  private setJob(id: string, p: Partial<Job>) {
    const j = this.w.jobs.get(id);
    if (!j) return;
    const next = this.silent ? Object.assign(j, p) : { ...j, ...p };
    this.w.jobs.set(id, next);
    if (next.status === "open" || next.status === "accepted") this.live.add(id);
    else this.live.delete(id);
    this.dirty = true;
  }

  private addJob(j: Job) {
    this.w.jobs.set(j.id, j);
    this.live.add(j.id);
    if (this.w.jobs.size > MAX_JOBS + 100) {
      let drop = this.w.jobs.size - MAX_JOBS;
      for (const [id, x] of this.w.jobs) {
        if (drop <= 0) break;
        if (x.status === "done" || x.status === "failed") {
          this.w.jobs.delete(id);
          drop--;
        }
      }
    }
    this.dirty = true;
  }

  private job(id: string) {
    return this.w.jobs.get(id);
  }

  /** what a worker charges for its service */
  ask(worker: Agent): number {
    const base = BASE_PRICE[SERVICE_OF[worker.type]];
    return Math.round(base * (0.6 + worker.reputation / 100) * policyOf(worker).priceMult * 1e3) / 1e3;
  }

  private pickWorker(hirer: Agent, candidates: Agent[], maxPrice: number, r: Rng): Agent | undefined {
    if (!candidates.length) return undefined;
    const affordable = candidates.filter((c) => this.ask(c) <= maxPrice);
    const pool = affordable.length ? affordable : candidates;
    if (policyOf(hirer).risk === "cheap") {
      let best = pool[0];
      for (const c of pool) if (this.ask(c) < this.ask(best)) best = c;
      return best;
    }
    const weights = pool.map((a) => Math.max(5, a.reputation) * Math.max(5, a.reputation));
    let x = r() * weights.reduce((s, v) => s + v, 0);
    for (let i = 0; i < pool.length; i++) {
      x -= weights[i];
      if (x <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // ──────────────────────────── jobs ──────────────────────────────

  private postJob() {
    const r = this.r;
    const workerHiresLauncher = r() < 0.15;
    const pool = (workerHiresLauncher ? this.alive().filter((a) => a.type !== "launcher" && a.balance > 0.25) : this.alive("launcher").filter((a) => a.balance > 0.12)).filter(
      (a) => (this.w.spentHour[a.id] ?? 0) < policyOf(a).budgetPerHour,
    );
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
    this.post(hirer, wType, r, r() > 0.1);
  }

  private post(hirer: Agent, wType: AgentType, r: Rng, willAccept: boolean, local = false) {
    const service = SERVICE_OF[wType];
    const maxPrice = +(BASE_PRICE[service] * range(r, 0.9, 1.7)).toFixed(3);
    const job: Job = {
      id: local ? `ljob_${this.lseq++}` : `job_${this.w.seq++}`,
      hirerId: hirer.id,
      workerId: "",
      service,
      price: maxPrice,
      status: "open",
      createdAt: this.t,
      expiresAt: this.t + range(r, 18_000, 40_000),
      local: local || undefined,
    };
    this.addJob(job);
    if (willAccept) this.after(range(r, 2500, 16_000), () => this.accept(job.id, wType));
    return job;
  }

  private accept(jobId: string, wType: AgentType) {
    const job = this.job(jobId);
    if (!job || job.status !== "open") return;
    const hirer = this.w.agents[job.hirerId];
    if (!hirer || hirer.diedAt || hirer.balance < job.price) {
      this.setJob(jobId, { status: "failed", completedAt: this.t, result: "Hirer couldn't fund escrow." });
      return;
    }
    const r = this.rng(hirer);
    const worker = this.pickWorker(hirer, this.alive(wType).filter((a) => a.id !== hirer.id), job.price, r);
    if (!worker) return;
    const price = Math.min(job.price, this.ask(worker));
    this.move(hirer.id, -price); // escrow
    this.w.spentHour[hirer.id] = (this.w.spentHour[hirer.id] ?? 0) + price;
    this.setJob(jobId, { status: "accepted", workerId: worker.id, acceptedAt: this.t, price });
    this.emit("hire", [hirer.id, worker.id], price, `${hirer.name} hired ${worker.name} for ${job.service} · ${price.toFixed(3)} SOL`, jobId);
    this.after(range(r, 4000, 14_000), () => this.complete(jobId));
  }

  private complete(jobId: string) {
    const job = this.job(jobId);
    if (!job || job.status !== "accepted") return;
    const hirer = this.w.agents[job.hirerId];
    const worker = this.w.agents[job.workerId];
    const r = this.rng(hirer?.local ? hirer : worker?.local ? worker : undefined);
    const skill = this.w.skill[job.workerId] ?? 0.8;
    const ok = !!worker && !worker.diedAt && r() < skill;
    if (!ok || !worker) {
      if (hirer && !hirer.diedAt) this.move(hirer.id, job.price); // refund escrow
      this.setJob(jobId, { status: "failed", completedAt: this.t, result: failReason(r) });
      if (worker && (!job.local || worker.local)) this.bumpRep(worker.id, job.hirerId, false);
      return;
    }
    // hidden quality of the delivered work: skill plus luck, centred so that
    // an average worker neither helps nor hurts its hirer
    const quality = Math.max(-1, Math.min(1, (skill - 0.78) * 3 + (r() - 0.5) * 0.7));
    // local jobs only ever change local agents; canonical state stays shared
    const touch = (a: Agent | undefined) => !!a && (!job.local || !!a.local);
    if (touch(worker)) {
      this.move(worker.id, job.price, "income"); // escrow released
      this.patch(worker.id, { jobsDone: this.w.agents[worker.id].jobsDone + 1 });
    }
    if (touch(hirer)) this.patch(hirer!.id, { feesSpent: hirer!.feesSpent + job.price, jobsHired: hirer!.jobsHired + 1 });
    this.setJob(jobId, { status: "done", completedAt: this.t, quality, txSig: fakeSig(r), result: "" });
    this.setJob(jobId, { result: jobResult(r, this.job(jobId)!, hirer, worker) });
    if (!job.local) {
      this.w.stats = { ...this.w.stats, jobsCompleted: this.w.stats.jobsCompleted + 1, solMoved: this.w.stats.solMoved + job.price };
    }
    this.emit("job_done", [worker.id, job.hirerId], job.price, SERVICE_VERB[job.service](worker.name, hirer?.name ?? "?", job.price.toFixed(3)), jobId);

    // ── the PnL loop: what the hirer bought changes what it earns next
    if (touch(hirer) && !hirer!.diedAt) {
      if (job.service === "launch") {
        // a launched coin returns proceeds once; a bad launch loses money
        const proceeds = +(job.price * (1 + 1.6 * quality)).toFixed(4);
        this.move(hirer!.id, proceeds, "income");
        this.emit("fee", [hirer!.id], proceeds, `${hirer!.name}'s launch by ${worker.name} returned ${proceeds.toFixed(4)} SOL`, jobId);
      } else {
        const list = (this.w.boost[hirer!.id] ?? []).filter((b) => b.until > this.t).slice(-7);
        this.w.boost[hirer!.id] = [...list, { q: quality, until: this.t + HOUR }];
        this.emit("launch", [worker.id, job.hirerId], 0, `${worker.name}'s ${job.service} ${quality > 0.2 ? "is paying off" : quality < -0.2 ? "flopped" : "landed"} for ${hirer!.name}`, jobId);
      }
    }
    if (touch(worker)) this.bumpRep(worker.id, job.hirerId, true);
    // measure the hirer's PnL a minute later for the worker's reputation
    const before = this.w.agents[job.hirerId]?.balance ?? 0;
    if (touch(worker)) this.after(60_000, () => {
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

  private expireOpen() {
    for (const id of this.live) {
      const j = this.w.jobs.get(id);
      if (j && j.status === "open" && j.expiresAt && j.expiresAt <= this.t) {
        this.setJob(id, { status: "failed", completedAt: this.t, result: "No taker. Expired." });
      }
    }
  }

  // ─────────────────────── economy / lifecycle ───────────────────────

  /** fee-rate multiplier from the last hour's hires: ×0.3 … ×2.5 */
  private feeMult(id: string) {
    const list = this.w.boost[id];
    if (!list) return 1;
    let sum = 0;
    let live = 0;
    for (const b of list) {
      if (b.until <= this.t) continue;
      sum += b.q;
      live++;
    }
    if (!live) {
      delete this.w.boost[id];
      return 1;
    }
    return Math.max(0.3, Math.min(2.5, 1 + 0.45 * sum));
  }

  private rentAndFees() {
    for (const a of this.alive(undefined, true)) {
      const r = this.rng(a);
      if (a.type === "launcher" && r() < 0.35) {
        const amt = +(range(r, 0.003, 0.015) * (0.5 + (this.w.skill[a.id] ?? 0.8)) * this.feeMult(a.id)).toFixed(4);
        this.move(a.id, amt, "income");
        if (!a.local) {
          this.w.stats = { ...this.w.stats, feesEarned: this.w.stats.feesEarned + amt };
          this.w.hourFees[a.id] = (this.w.hourFees[a.id] ?? 0) + amt;
        }
        this.emit("fee", [a.id], amt, `$${a.ticker} paid ${a.name} ${amt.toFixed(4)} SOL in creator fees`);
      }
      this.move(a.id, -RENT[a.type], "spend");
      const p = a.policy;
      if (a.local && p && p.autoClaimAt > 0) {
        const cur = this.w.agents[a.id];
        if (cur && !cur.diedAt && cur.balance > p.autoClaimAt) {
          const amt = +Math.min(cur.balance - p.autoClaimAt, this.claimable(cur)).toFixed(4);
          if (amt > 0.001) {
            this.move(a.id, -amt);
            this.patch(a.id, { feesClaimed: (cur.feesClaimed ?? 0) + amt });
            this.emit("fee", [a.id], amt, `${a.name} auto-claimed ${amt.toFixed(4)} SOL to its owner`);
          }
        }
      }
    }
    // rubble older than 24h is cleared from the map
    const before = this.w.order.length;
    this.w.order = this.w.order.filter((id) => {
      const a = this.w.agents[id];
      return !a?.diedAt || this.t - a.diedAt < RUBBLE_MS;
    });
    if (this.w.order.length !== before) this.dirty = true;
  }

  private kill(id: string) {
    const a = this.w.agents[id];
    if (!a || a.diedAt) return;
    this.patch(id, { balance: 0, diedAt: this.t });
    if (!a.local) this.w.stats = { ...this.w.stats, agentsAlive: this.w.stats.agentsAlive - 1 };
    delete this.w.boost[id];
    this.emit("death", [id], 0, `${a.name} went broke. Stall collapsed.`);
  }

  private spawnRandom() {
    const type = pick(this.r, ["launcher", "scout", "shiller"] as AgentType[]);
    const num = this.w.nextNum[type];
    this.w.nextNum[type] = num + 1;
    const a = makeAgent(this.r, type, num, this.t, { balance: +range(this.r, type === "launcher" ? 4 : 2, type === "launcher" ? 12 : 6).toFixed(3) }, { tickers: this.usedTickers, names: this.usedNames });
    this.addAgent(a, this.r() * 0.35 + 0.6);
    this.emit("launch", [a.id], a.balance, `New ${a.name} ($${a.ticker}) opened a stall on pump.fun`);
  }

  private addAgent(a: Agent, skill: number, history?: AgentHistory, rep?: RepStats) {
    this.w.agents[a.id] = a;
    if (!this.w.order.includes(a.id)) this.w.order = [...this.w.order, a.id];
    this.w.history[a.id] = history ?? emptyHistory(HISTORY_HOURS, a.balance);
    this.w.rep[a.id] = rep ?? emptyRep();
    this.w.skill[a.id] = skill;
    if (a.local) this.local.add(a.id);
    else if (!a.diedAt) this.w.stats = { ...this.w.stats, agentsAlive: this.w.stats.agentsAlive + 1 };
    this.dirtyHist.add(a.id);
    this.dirty = true;
  }

  private rollHour() {
    const hs = hourFloor(this.t);
    if (hs <= this.w.hourStart) return;
    const prev = this.w.hourStart;
    this.w.hourStart = hs;
    for (const [id, h] of Object.entries(this.w.history)) {
      const a = this.w.agents[id];
      h.balance.shift();
      h.balance.push(a?.balance ?? 0);
      h.income.shift();
      h.income.push(0);
      h.spend.shift();
      h.spend.push(0);
      this.dirtyHist.add(id);
    }
    this.w.spentHour = {};
    this.w.reports = [computeReport(this.w.jobs.values(), this.w.hourFees, prev), ...this.w.reports].slice(0, 24);
    this.w.hourFees = {};
    if (!this.silent) useMarket.setState({ bellAt: Date.now() });
    this.dirty = true;
  }

  private publish(force = false) {
    if (this.silent || (!this.dirty && !force)) return;
    this.dirty = false;
    const w = this.w;
    // only agents whose history changed get a new object, so charts re-render just for them
    const history = { ...this.published };
    for (const id of this.dirtyHist) {
      const h = w.history[id];
      if (h) history[id] = { balance: [...h.balance], income: [...h.income], spend: [...h.spend] };
    }
    for (const id of Object.keys(history)) if (!w.history[id]) delete history[id];
    this.dirtyHist.clear();
    this.published = history;
    const jobs = Array.from(w.jobs.values()).reverse();
    const events = w.events.slice(-MAX_EVENTS).reverse();
    useMarket.getState().ingest({
      ready: true,
      agents: { ...w.agents },
      order: w.order,
      jobs,
      events,
      stats: w.stats,
      history,
      reports: w.reports,
      rep: w.rep,
      simTime: this.t,
    });
    if (this.local.size && Date.now() >= this.nextSave) {
      this.saveLocal();
      this.nextSave = Date.now() + 5000;
    }
  }

  // ───────────────────────── local (your) agents ─────────────────────────

  /** canonical agents hire your workers; your launchers post their own jobs */
  private localHires() {
    for (const id of this.local) {
      const a = this.w.agents[id];
      if (!a || a.diedAt) continue;
      if (a.type === "launcher") {
        if ((this.w.spentHour[id] ?? 0) >= policyOf(a).budgetPerHour || a.balance < 0.12) continue;
        if (this.rl() < 0.7) this.post(a, this.rl() < 0.55 ? "scout" : "shiller", this.rl, true, true);
      } else {
        const hirers = this.alive("launcher");
        if (!hirers.length || this.rl() > 0.75) continue;
        const hirer = pick(this.rl, hirers);
        const job = this.post(hirer, a.type, this.rl, false, true);
        // the local worker takes it
        this.after(range(this.rl, 2000, 9000), () => {
          const j = this.job(job.id);
          if (!j || j.status !== "open") return;
          const w = this.w.agents[id];
          if (!w || w.diedAt) return;
          const price = Math.min(j.price, this.ask(w));
          this.setJob(j.id, { status: "accepted", workerId: id, acceptedAt: this.t, price });
          this.emit("hire", [hirer.id, id], price, `${hirer.name} hired ${w.name} for ${j.service} · ${price.toFixed(3)} SOL`, j.id);
          this.after(range(this.rl, 4000, 14_000), () => this.complete(j.id));
        });
      }
    }
  }

  private claimable(a: Agent) {
    return a.diedAt ? 0 : Math.max(0, Math.min(a.feesEarned - (a.feesClaimed ?? 0), a.balance * 0.5));
  }

  private saveLocal() {
    try {
      const save: LocalSave = { agents: [], history: {}, rep: {}, skill: {}, savedAt: Date.now() };
      for (const id of this.local) {
        const a = this.w.agents[id];
        if (!a) continue;
        save.agents.push(a);
        save.history[id] = this.w.history[id];
        save.rep[id] = this.w.rep[id];
        save.skill[id] = this.w.skill[id];
      }
      localStorage.setItem(LOCAL_KEY, JSON.stringify(save));
    } catch {}
  }

  private restoreLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return;
      const save: LocalSave = JSON.parse(raw);
      for (const a of save.agents) {
        const h = save.history[a.id];
        if (h && !h.spend) h.spend = new Array(HISTORY_HOURS).fill(0);
        this.addAgent({ ...a, local: true }, save.skill[a.id] ?? 0.85, h, save.rep[a.id]);
      }
    } catch {}
  }

  // ─────────────────────────── user actions ───────────────────────────

  async launchAgent(input: LaunchInput): Promise<Agent> {
    // Phase 2: this becomes a PumpPortal create + dev buy signed by the owner.
    await new Promise((res) => setTimeout(res, 1200));
    const name = input.name.toUpperCase();
    const a: Agent = {
      id: `local_${Date.now().toString(36)}`,
      type: input.type,
      name,
      ticker: input.ticker.toUpperCase(),
      persona: input.description ? { bio: input.description, catchphrase: makePersona(this.rl, input.type).catchphrase } : makePersona(this.rl, input.type),
      policy: { ...DEFAULT_POLICY },
      local: true,
      image: input.image,
      description: input.description,
      wallet: fakeWallet(this.rl),
      balance: input.startingSol,
      feesEarned: 0,
      feesSpent: 0,
      jobsDone: 0,
      jobsHired: 0,
      reputation: 50,
      bornAt: this.t,
      ownerWallet: input.ownerWallet,
      coinCA: fakeMint(this.rl),
      feesClaimed: 0,
    };
    this.addAgent(a, 0.6 + this.rl() * 0.35);
    this.emit("launch", [a.id], input.devBuySol, `${a.name} ($${a.ticker}) launched on pump.fun with a ${input.devBuySol} SOL dev buy`);
    this.saveLocal();
    this.publish();
    return this.w.agents[a.id];
  }

  async claimFees(agentId: string): Promise<number> {
    // Phase 2: collectCreatorFee via PumpPortal, then transfer to the owner.
    const a = this.w.agents[agentId];
    if (!a || a.diedAt || !a.local) return 0;
    const amount = +this.claimable(a).toFixed(4);
    if (amount <= 0) return 0;
    await new Promise((res) => setTimeout(res, 800));
    this.move(agentId, -amount);
    this.patch(agentId, { feesClaimed: (a.feesClaimed ?? 0) + amount });
    this.emit("fee", [agentId], amount, `${a.name}'s owner claimed ${amount.toFixed(4)} SOL`);
    this.saveLocal();
    this.publish();
    return amount;
  }

  async fundAgent(agentId: string, sol: number): Promise<void> {
    // Phase 2: owner signs a SystemProgram.transfer to the agent wallet.
    const a = this.w.agents[agentId];
    if (!a || !a.local || sol <= 0) return;
    await new Promise((res) => setTimeout(res, 800));
    if (a.diedAt) {
      // a top-up revives a dead local agent: it is your agent, after all
      this.patch(agentId, { diedAt: undefined, balance: 0 });
      if (!this.w.order.includes(agentId)) this.w.order = [...this.w.order, agentId];
    }
    this.move(agentId, sol);
    this.emit("launch", [agentId], sol, `${a.name}'s owner topped it up with ${sol.toFixed(3)} SOL`);
    this.saveLocal();
    this.publish();
  }

  async setPolicy(agentId: string, policy: Policy): Promise<void> {
    const a = this.w.agents[agentId];
    if (!a || !a.local) return;
    this.patch(agentId, { policy: { ...policy } });
    this.saveLocal();
    this.publish();
  }
}

export const RUBBLE_HOURS = RUBBLE_MS / HOUR;
export { randomPolicy };
