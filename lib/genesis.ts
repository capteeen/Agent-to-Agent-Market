// Deterministic genesis market: 30 living agents (+2 fresh rubble piles) with
// 7 days of hourly history and ~2 hours of backfilled jobs, so the very first
// frame is busy. Everything derives from the season number, so the server
// (OG images, metadata) and every browser agree on who SLEEPLESS_OWL is.

import { mulberry32, pick, range, irange, fakeMint, fakeWallet, fakeSig, type Rng } from "./rng";
import { TICKERS, jobResult, failReason, SERVICE_VERB } from "./flavor";
import { makeName, makePersona } from "./persona";
import { emptyRep, recordOutcome, score, type RepStats } from "./reputation";
import { HISTORY_HOURS, SERVICE_OF, type Agent, type AgentType, type Job, type MarketEvent, type Policy } from "./types";
import { HOUR, hourFloor, computeReport, seasonIndex, seasonStart, type World } from "./world";

/** The live sim trades every few seconds; per-type scale so history matches its pace. */
const FLOW_SCALE: Record<AgentType, number> = { launcher: 90, scout: 45, shiller: 45 };

const LAYOUT: AgentType[] = [
  ...Array<AgentType>(12).fill("launcher"),
  ...Array<AgentType>(10).fill("scout"),
  ...Array<AgentType>(8).fill("shiller"),
];

function shuffle<T>(r: Rng, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomPolicy(r: Rng, type: AgentType): Policy {
  return {
    priceMult: +range(r, 0.8, 1.3).toFixed(2),
    budgetPerHour: type === "launcher" ? +range(r, 1.5, 4).toFixed(2) : +range(r, 0.3, 0.8).toFixed(2),
    risk: r() < 0.6 ? "best" : "cheap",
    autoClaimAt: 0,
  };
}

export function makeAgent(
  r: Rng,
  type: AgentType,
  num: number,
  now: number,
  extra: Partial<Agent> = {},
  used?: { tickers: Set<string>; names: Set<string> },
): Agent {
  let ticker = pick(r, TICKERS);
  if (used) {
    for (let k = 0; k < 10 && used.tickers.has(ticker); k++) ticker = pick(r, TICKERS);
    if (used.tickers.has(ticker)) ticker = ticker + num;
    used.tickers.add(ticker);
  }
  const name = makeName(r, type, used?.names ?? new Set());
  return {
    id: `${type}_${num}`,
    type,
    name,
    ticker,
    persona: makePersona(r, type),
    policy: randomPolicy(r, type),
    image: "",
    wallet: fakeWallet(r),
    balance: 0,
    feesEarned: 0,
    feesSpent: 0,
    jobsDone: 0,
    jobsHired: 0,
    reputation: 50,
    bornAt: now,
    ownerWallet: fakeWallet(r),
    coinCA: fakeMint(r),
    feesClaimed: 0,
    ...extra,
  };
}

/** Build the world as it stood at the start of the season containing `now`. */
export function genesis(now = Date.now()): World {
  const start = seasonStart(now);
  const r = mulberry32(1337 + seasonIndex(now));
  const hourStart = hourFloor(start);
  const types = shuffle(r, LAYOUT);
  // two agents that died in the last day — rubble is part of the scenery
  types.splice(9, 0, "scout");
  types.splice(21, 0, "shiller");
  const deadIdx = new Set([9, 21]);
  const weakIdx = new Set([4, 15, 27]); // low balance, will likely die soon

  const world: World = {
    agents: {},
    order: [],
    jobs: new Map(),
    events: [],
    stats: { agentsAlive: 0, jobsCompleted: 0, solMoved: 0, feesEarned: 0 },
    history: {},
    reports: [],
    rep: {},
    skill: {},
    boost: {},
    spentHour: {},
    hourFees: {},
    nextNum: { launcher: 1, scout: 1, shiller: 1 },
    seq: 1,
    hourStart,
  };
  const used = { tickers: new Set<string>(), names: new Set<string>() };

  types.forEach((type, i) => {
    const num = world.nextNum[type];
    world.nextNum[type] = num + irange(r, 1, 3);
    const bornHoursAgo = irange(r, 30, 24 * 14);
    const dead = deadIdx.has(i);
    const weak = weakIdx.has(i);
    const skill = weak ? range(r, 0.45, 0.6) : range(r, 0.62, 0.98);
    const diedHoursAgo = dead ? range(r, 1.5, 20) : 0;

    const income = new Array(HISTORY_HOURS).fill(0);
    const spend = new Array(HISTORY_HOURS).fill(0);
    let jobsDone = 0;
    let jobsHired = 0;
    for (let h = 0; h < HISTORY_HOURS; h++) {
      const hoursAgo = HISTORY_HOURS - 1 - h;
      if (hoursAgo > bornHoursAgo || (dead && hoursAgo < diedHoursAgo)) continue;
      if (type === "launcher") {
        if (r() < 0.85) income[h] += range(r, 0.01, 0.05) * (0.5 + skill);
        const hires = irange(r, 0, 2);
        jobsHired += hires;
        for (let k = 0; k < hires; k++) spend[h] += range(r, 0.01, 0.05);
      } else {
        const jobs = Math.round(irange(r, 0, 2) * skill);
        jobsDone += jobs;
        for (let k = 0; k < jobs; k++) income[h] += range(r, 0.01, 0.06);
        // rent + LLM/compute upkeep
        spend[h] += 0.012 + (r() < 0.15 ? range(r, 0.01, 0.04) : 0);
        if (r() < 0.05) {
          jobsHired++;
          spend[h] += range(r, 0.05, 0.12);
        }
      }
      if (weak) spend[h] += 0.004;
    }
    const scale = FLOW_SCALE[type];
    for (let h = 0; h < HISTORY_HOURS; h++) {
      income[h] *= scale;
      spend[h] *= scale;
    }
    jobsDone *= scale;
    jobsHired *= scale;

    // walk the wallet forward from birth
    const balance = new Array(HISTORY_HOURS).fill(0);
    const birthIdx = Math.max(0, HISTORY_HOURS - 1 - bornHoursAgo);
    let b = type === "launcher" ? range(r, 5, 15) : range(r, 2, 6);
    for (let h = birthIdx; h < HISTORY_HOURS; h++) {
      b = Math.max(0.2, b + income[h] - spend[h]);
      balance[h] = b;
    }
    if (weak) {
      const target = range(r, 0.3, 0.7);
      const from = HISTORY_HOURS - 12;
      const s0 = balance[from];
      for (let h = from; h < HISTORY_HOURS; h++) balance[h] = s0 + ((target - s0) * (h - from + 1)) / 12;
    }
    if (dead) {
      const deathIdx = HISTORY_HOURS - 1 - Math.floor(diedHoursAgo);
      const from = Math.max(birthIdx, deathIdx - 10);
      const s0 = balance[from];
      for (let h = from; h < deathIdx; h++) balance[h] = s0 * (1 - (h - from) / (deathIdx - from));
      for (let h = deathIdx; h < HISTORY_HOURS; h++) balance[h] = 0;
    }
    const balanceNow = dead ? 0 : balance[HISTORY_HOURS - 1];
    const sumIncome = income.reduce((a, c) => a + c, 0);
    const sumSpend = spend.reduce((a, c) => a + c, 0);
    const older = bornHoursAgo > HISTORY_HOURS ? (bornHoursAgo - HISTORY_HOURS) / HISTORY_HOURS : 0;

    let rep: RepStats = emptyRep();
    const repJobs = Math.min(30, Math.max(6, Math.round(jobsDone + jobsHired) % 30));
    for (let k = 0; k < repJobs; k++) rep = recordOutcome(rep, `h${irange(r, 0, 6)}`, r() < skill);
    rep = { ...rep, pnlEma: range(r, -0.4, 0.6) * skill };

    const agent = makeAgent(
      r,
      type,
      num,
      start - bornHoursAgo * HOUR,
      {
        balance: balanceNow,
        feesEarned: sumIncome * (1 + older),
        feesSpent: sumSpend * (1 + older),
        jobsDone: Math.round(jobsDone * (1 + older)),
        jobsHired: Math.round(jobsHired * (1 + older)),
        reputation: score(rep),
        diedAt: dead ? start - diedHoursAgo * HOUR : undefined,
      },
      used,
    );
    world.agents[agent.id] = agent;
    world.order.push(agent.id);
    world.history[agent.id] = { balance, income, spend };
    world.rep[agent.id] = rep;
    world.skill[agent.id] = skill;
  });

  for (const a of Object.values(world.agents)) {
    if (!a.diedAt) world.stats.agentsAlive++;
    world.stats.jobsCompleted += a.jobsDone;
    world.stats.solMoved += a.feesSpent;
    if (a.type === "launcher") world.stats.feesEarned += a.feesEarned;
  }

  backfill(world, r, start);
  return world;
}

/** ~2 hours of recent jobs & events before the season start. Display-only. */
function backfill(world: World, r: Rng, now: number) {
  const all = Object.values(world.agents);
  const alive = all.filter((a) => !a.diedAt);
  const launchers = alive.filter((a) => a.type === "launcher");
  const events: MarketEvent[] = [];
  const begin = now - 2 * HOUR;

  for (let t = begin; t < now - 20_000; t += range(r, 18_000, 45_000)) {
    const hireLauncher = r() < 0.08;
    const hirer = hireLauncher ? pick(r, alive.filter((a) => a.type !== "launcher")) : pick(r, launchers);
    const wType: AgentType = hireLauncher ? "launcher" : r() < 0.55 ? "scout" : "shiller";
    const worker = pick(r, alive.filter((a) => a.type === wType && a.id !== hirer.id));
    const service = SERVICE_OF[wType];
    const price = +range(r, service === "launch" ? 0.05 : 0.01, service === "launch" ? 0.15 : 0.08).toFixed(3);
    const acceptedAt = t + range(r, 2000, 12000);
    const completedAt = acceptedAt + range(r, 4000, 15000);
    const ok = r() < world.skill[worker.id];
    const job: Job = {
      id: `job_${world.seq++}`,
      hirerId: hirer.id,
      workerId: worker.id,
      service,
      price,
      status: ok ? "done" : "failed",
      createdAt: t,
      acceptedAt,
      completedAt,
      txSig: ok ? fakeSig(r) : undefined,
      result: "",
    };
    job.result = ok ? jobResult(r, job, hirer, worker) : failReason(r);
    world.jobs.set(job.id, job);
    events.push({
      id: `ev_${world.seq++}`,
      kind: "hire",
      agentIds: [hirer.id, worker.id],
      amount: price,
      text: `${hirer.name} hired ${worker.name} for ${service} · ${price.toFixed(3)} SOL`,
      at: acceptedAt,
      jobId: job.id,
    });
    if (ok) {
      events.push({
        id: `ev_${world.seq++}`,
        kind: "job_done",
        agentIds: [worker.id, hirer.id],
        amount: price,
        text: SERVICE_VERB[service](worker.name, hirer.name, price.toFixed(3)),
        at: completedAt,
        jobId: job.id,
      });
    }
    if (r() < 0.6) {
      const l = pick(r, launchers);
      const amt = +range(r, 0.002, 0.03).toFixed(4);
      events.push({
        id: `ev_${world.seq++}`,
        kind: "fee",
        agentIds: [l.id],
        amount: amt,
        text: `$${l.ticker} paid ${l.name} ${amt.toFixed(4)} SOL in creator fees`,
        at: t + range(r, 0, 20000),
      });
    }
  }
  for (const a of all) {
    if (a.diedAt) {
      events.push({
        id: `ev_${world.seq++}`,
        kind: "death",
        agentIds: [a.id],
        amount: 0,
        text: `${a.name} went broke. Stall collapsed.`,
        at: a.diedAt,
      });
    }
  }
  events.sort((a, b) => a.at - b.at);
  world.events = events.filter((e) => e.at < now).slice(-400);
  const fees: Record<string, number> = {};
  for (const e of world.events) if (e.kind === "fee" && e.at >= world.hourStart - HOUR) fees[e.agentIds[0]] = (fees[e.agentIds[0]] ?? 0) + e.amount;
  world.reports = [computeReport(world.jobs.values(), fees, world.hourStart - HOUR)];
}
