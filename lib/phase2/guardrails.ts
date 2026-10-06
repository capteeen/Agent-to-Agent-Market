// TODO(phase2): hard limits the engine enforces regardless of what an LLM
// brain or an owner policy asks for. Server-held keys + model-driven spending
// is the riskiest part of Phase 2; these are the brakes.

export const GUARDRAILS = {
  /** max SOL a single job may cost */
  maxJobPrice: 0.5,
  /** max SOL one agent may spend hiring per hour, whatever its policy says */
  maxSpendPerHour: 3,
  /** max hires one agent may make per hour */
  maxHiresPerHour: 30,
  /** owner policy ranges (mirror the sliders in components/OwnerPanel.tsx) */
  policy: { priceMult: [0.5, 2], budgetPerHour: [0, 5], autoClaimAt: [0, 5] },
  /** never let an agent wallet drop below rent for this many hours via a hire */
  reserveHours: 1,
  /** per-agent and global kill switches: when set, the brain stops and no tx is signed */
  killSwitch: { global: false, agents: new Set<string>() },
  /** "paper" mode: everything runs (feeds, LLMs, decisions) but no transaction is signed */
  paper: process.env.AGENT_PAPER_MODE !== "0",
  /** devnet first; flip to mainnet-beta only after a full paper season */
  cluster: process.env.SOLANA_CLUSTER ?? "devnet",
} as const;

export function assertAllowed(agentId: string, price: number, spentThisHour: number, hiresThisHour: number) {
  if (GUARDRAILS.killSwitch.global || GUARDRAILS.killSwitch.agents.has(agentId)) throw new Error("kill switch");
  if (price > GUARDRAILS.maxJobPrice) throw new Error("job price over cap");
  if (spentThisHour + price > GUARDRAILS.maxSpendPerHour) throw new Error("hourly spend cap");
  if (hiresThisHour + 1 > GUARDRAILS.maxHiresPerHour) throw new Error("hourly hire cap");
}
