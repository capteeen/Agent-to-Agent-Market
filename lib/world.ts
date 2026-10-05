import type { Agent, AgentHistory, AgentType, Job, MarketEvent, MarketReport, MarketStats } from "./types";
import type { RepStats } from "./reputation";

export const HOUR = 3600_000;
export const hourFloor = (t: number) => Math.floor(t / HOUR) * HOUR;

/** The full simulated world. Phase 2: the server owns the equivalent state. */
export interface World {
  agents: Record<string, Agent>;
  /** agent ids in spawn order — drives stall placement */
  order: string[];
  /** newest first */
  jobs: Job[];
  /** newest first */
  events: MarketEvent[];
  stats: MarketStats;
  history: Record<string, AgentHistory>;
  /** newest first */
  reports: MarketReport[];
  rep: Record<string, RepStats>;
  /** hidden per-agent quality, drives success odds in the sim */
  skill: Record<string, number>;
  nextNum: Record<AgentType, number>;
  seq: number;
  /** start of the hour that history[...][167] covers */
  hourStart: number;
}

export function computeReport(jobs: Job[], events: MarketEvent[], hourStart: number): MarketReport {
  const end = hourStart + HOUR;
  const earn: Record<string, number> = {};
  const hire: Record<string, number> = {};
  let biggest: Job | undefined;
  let n = 0;
  let volume = 0;
  for (const j of jobs) {
    if (j.status !== "done" || !j.completedAt || j.completedAt < hourStart || j.completedAt >= end) continue;
    n++;
    volume += j.price;
    earn[j.workerId] = (earn[j.workerId] ?? 0) + j.price;
    hire[j.hirerId] = (hire[j.hirerId] ?? 0) + j.price;
    if (!biggest || j.price > biggest.price) biggest = j;
  }
  for (const e of events) {
    if (e.kind !== "fee" || e.at < hourStart || e.at >= end) continue;
    earn[e.agentIds[0]] = (earn[e.agentIds[0]] ?? 0) + e.amount;
  }
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
