// Hard limits the engine enforces regardless of what a brain or an owner
// policy asks for. Server-held keys plus model-driven spending is the riskiest
// part of this system; these are the brakes, and the engine calls
// assertAllowed() before every transfer it signs.

import type { Policy } from "../lib/types";

export const GUARDRAILS = {
  /** max SOL a single job may cost */
  maxJobPrice: Number(process.env.GUARD_MAX_JOB_PRICE ?? 0.5),
  /** max SOL one agent may spend hiring per hour, whatever its policy says */
  maxSpendPerHour: Number(process.env.GUARD_MAX_SPEND_PER_HOUR ?? 3),
  /** max hires one agent may make per hour */
  maxHiresPerHour: Number(process.env.GUARD_MAX_HIRES_PER_HOUR ?? 30),
  /** max SOL an owner may withdraw from one agent per hour */
  maxClaimPerHour: Number(process.env.GUARD_MAX_CLAIM_PER_HOUR ?? 10),
  /** owner policy ranges (mirror the sliders in components/OwnerPanel.tsx) */
  policy: { priceMult: [0.5, 2], budgetPerHour: [0, 5], autoClaimAt: [0, 5] } as const,
  /** never let a hire leave an agent unable to pay this many hours of rent */
  reserveHours: 1,
};

export class KillSwitch {
  global = process.env.MARKET_KILL_SWITCH === "1";
  agents = new Set<string>();
  check(agentId: string) {
    if (this.global) throw new Error("global kill switch is on");
    if (this.agents.has(agentId)) throw new Error(`kill switch on for ${agentId}`);
  }
}

export function assertAllowed(
  kill: KillSwitch,
  agentId: string,
  price: number,
  spentThisHour: number,
  hiresThisHour: number,
  balanceAfter: number,
  rentPerHour: number,
) {
  kill.check(agentId);
  if (!(price > 0) || price > GUARDRAILS.maxJobPrice) throw new Error(`job price ${price} over cap ${GUARDRAILS.maxJobPrice}`);
  if (spentThisHour + price > GUARDRAILS.maxSpendPerHour) throw new Error("hourly spend cap");
  if (hiresThisHour + 1 > GUARDRAILS.maxHiresPerHour) throw new Error("hourly hire cap");
  if (balanceAfter < rentPerHour * GUARDRAILS.reserveHours) throw new Error("would breach rent reserve");
}

export function clampPolicy(p: Partial<Policy>): Policy {
  const r = GUARDRAILS.policy;
  const num = (v: unknown, [lo, hi]: readonly [number, number], d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };
  return {
    priceMult: num(p.priceMult, r.priceMult, 1),
    budgetPerHour: num(p.budgetPerHour, r.budgetPerHour, 1),
    risk: p.risk === "cheap" ? "cheap" : "best",
    autoClaimAt: num(p.autoClaimAt, r.autoClaimAt, 0),
  };
}
