import { DEFAULT_POLICY, SEASON_MS, SEASON_ORIGIN, type Agent, type AgentHistory, type AgentType, type Job, type MarketEvent, type MarketReport, type MarketStats, type Policy } from "./types";
import type { RepStats } from "./reputation";

export const HOUR = 3600_000;
export const hourFloor = (t: number) => Math.floor(t / HOUR) * HOUR;

export const seasonIndex = (now: number) => Math.floor((now - SEASON_ORIGIN) / SEASON_MS);
export const seasonStart = (now: number) => SEASON_ORIGIN + seasonIndex(now) * SEASON_MS;

/** A hired pick/post lifts (or sinks) a launcher's fee rate for an hour. */
export interface Boost {
  q: number;
  until: number;
}

/** The full simulated world. Phase 2: the server owns the equivalent state. */
export interface World {
  agents: Record<string, Agent>;
  /** agent ids in spawn order — drives stall placement */
  order: string[];
  jobs: Map<string, Job>;
  /** oldest first; trimmed */
  events: MarketEvent[];
  stats: MarketStats;
  history: Record<string, AgentHistory>;
  /** newest first */
  reports: MarketReport[];
  rep: Record<string, RepStats>;
  /** hidden per-agent quality, drives success odds and pick quality */
  skill: Record<string, number>;
  boost: Record<string, Boost[]>;
  /** SOL spent hiring in the current hour, per agent */
  spentHour: Record<string, number>;
  /** creator fees earned in the current hour, per launcher */
  hourFees: Record<string, number>;
  nextNum: Record<AgentType, number>;
  seq: number;
  /** start of the hour that history[...][167] covers */
  hourStart: number;
}

export const policyOf = (a: Agent | undefined): Policy => a?.policy ?? DEFAULT_POLICY;

export function computeReport(jobs: Iterable<Job>, fees: Record<string, number>, hourStart: number): MarketReport {
  const end = hourStart + HOUR;
  const earn: Record<string, number> = {};
  const hire: Record<string, number> = {};
  let biggest: Job | undefined;
  let n = 0;
  let volume = 0;
  for (const j of jobs) {
    if (j.local || j.status !== "done" || !j.completedAt || j.completedAt < hourStart || j.completedAt >= end) continue;
    n++;
    volume += j.price;
    earn[j.workerId] = (earn[j.workerId] ?? 0) + j.price;
    hire[j.hirerId] = (hire[j.hirerId] ?? 0) + j.price;
    if (!biggest || j.price > biggest.price) biggest = j;
  }
  for (const [id, amt] of Object.entries(fees)) earn[id] = (earn[id] ?? 0) + amt;
  const top = (m: Record<string, number>) => {
    let best: { agentId: string; amount: number } | undefined;
    for (const [agentId, amount] of Object.entries(m)) if (!best || amount > best.amount) best = { agentId, amount };
    return best;
  };
  return {
    hour: hourStart,
    topEarner: top(earn),
    topHirer: top(hire),
    biggestJob: biggest ? { jobId: biggest.id, amount: biggest.price } : undefined,
    jobs: n,
    volume,
  };
}

export const earnings7d = (h: AgentHistory | undefined) => (h ? h.income.reduce((a, b) => a + b, 0) : 0);

/** Hours of balance left at the recent net burn rate; Infinity if it's earning. */
export function runwayHours(a: Agent, h: AgentHistory | undefined, window = 6): number {
  if (!h || a.diedAt) return 0;
  const n = h.income.length;
  let burn = 0;
  for (let i = Math.max(0, n - window); i < n; i++) burn += h.spend[i] - h.income[i];
  burn /= window;
  if (burn <= 0) return Infinity;
  return a.balance / burn;
}

export function emptyHistory(len: number, balance = 0): AgentHistory {
  const h = { balance: new Array(len).fill(0), income: new Array(len).fill(0), spend: new Array(len).fill(0) };
  h.balance[len - 1] = balance;
  return h;
}
