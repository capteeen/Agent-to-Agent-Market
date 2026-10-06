// Shared data model. Used by the mock simulator (Phase 1) and the real
// backend (Phase 2) alike — keep this file free of runtime dependencies.

export type AgentType = "launcher" | "scout" | "shiller";
export type Service = "pick" | "attention" | "launch";
export type JobStatus = "open" | "accepted" | "done" | "failed";
export type EventKind = "hire" | "job_done" | "launch" | "death" | "fee";

export type Risk = "cheap" | "best";

/** Owner-set behaviour. Agents still make every hire themselves. */
export interface Policy {
  /** multiplier on the agent's asking price (0.5–2) */
  priceMult: number;
  /** max SOL it may spend hiring per hour */
  budgetPerHour: number;
  /** who it hires: cheapest ask, or best reputation */
  risk: Risk;
  /** auto-claim to the owner once balance exceeds this (0 = off) */
  autoClaimAt: number;
}

export const DEFAULT_POLICY: Policy = { priceMult: 1, budgetPerHour: 1, risk: "best", autoClaimAt: 0 };

export interface Persona {
  bio: string;
  catchphrase: string;
}

export interface Agent {
  id: string;
  type: AgentType;
  name: string;
  ticker: string;
  persona?: Persona;
  policy?: Policy;
  /** true for agents launched in this browser: they live only here */
  local?: boolean;
  /** Uploaded image (data URL / https). Empty string = use the type sprite. */
  image: string;
  description?: string;
  wallet: string;
  /** SOL */
  balance: number;
  /** Lifetime SOL earned (creator fees + job income). */
  feesEarned: number;
  /** Lifetime SOL spent hiring other agents. */
  feesSpent: number;
  jobsDone: number;
  jobsHired: number;
  /** 0-100, see lib/reputation.ts */
  reputation: number;
  bornAt: number;
  diedAt?: number;
  ownerWallet: string;
  coinCA: string;
  /** SOL already claimed by the owner from creator fees (Phase 2: on-chain claim). */
  feesClaimed?: number;
}

export interface Job {
  id: string;
  hirerId: string;
  workerId: string;
  service: Service;
  /** SOL */
  price: number;
  status: JobStatus;
  createdAt: number;
  /** Open jobs expire (fail) if nobody accepts before this time. */
  expiresAt?: number;
  /** hidden outcome quality, -1..1, drives the hirer's later PnL */
  quality?: number;
  /** involves an agent that exists only in this browser */
  local?: boolean;
  acceptedAt?: number;
  completedAt?: number;
  result?: string;
  txSig?: string;
}

export interface MarketEvent {
  id: string;
  kind: EventKind;
  agentIds: string[];
  /** SOL */
  amount: number;
  text: string;
  at: number;
  jobId?: string;
}

export interface MarketStats {
  agentsAlive: number;
  jobsCompleted: number;
  /** SOL moved agent-to-agent through completed jobs. */
  solMoved: number;
  /** Creator fees earned by launcher coins. */
  feesEarned: number;
}

/** Hourly series per agent, oldest first, 168 buckets = 7 days. */
export interface AgentHistory {
  /** balance at the end of each hour */
  balance: number[];
  /** SOL earned during each hour */
  income: number[];
  /** SOL spent during each hour (hires + rent) */
  spend: number[];
}

export interface MarketReport {
  hour: number; // epoch ms of the hour the report covers (start)
  topEarner?: { agentId: string; amount: number };
  topHirer?: { agentId: string; amount: number };
  biggestJob?: { jobId: string; amount: number };
  jobs: number;
  volume: number;
}

export interface LaunchInput {
  type: AgentType;
  name: string;
  ticker: string;
  image: string;
  description: string;
  startingSol: number;
  devBuySol: number;
  ownerWallet: string;
}

export const HISTORY_HOURS = 168;
/** The shared world restarts every season; everyone replays the same one. */
export const SEASON_MS = 7 * 24 * 60 * 60 * 1000;
/** Monday 2026-10-05 00:00 UTC */
export const SEASON_ORIGIN = Date.UTC(2026, 9, 5);
export const RUBBLE_MS = 24 * 60 * 60 * 1000;

export const SERVICE_OF: Record<AgentType, Service> = {
  launcher: "launch",
  scout: "pick",
  shiller: "attention",
};
