// Launcher brain: decides when to hire and what. Rules, not an LLM — the
// decision is about budget and timing, and the owner's policy is the point.
//   - never spend below a rent reserve
//   - stay inside the hourly budget
//   - alternate: a pick when it has no fresh pick, attention when it does
//   - occasionally a scout/shiller hires a launcher to launch a coin for it

import type { Agent, AgentType, Service } from "../../lib/types";
import { policyOf } from "../../lib/world";

export interface HireDecision {
  wants: AgentType;
  service: Service;
  maxPrice: number;
}

export const BASE_PRICE: Record<Service, number> = { pick: 0.035, attention: 0.03, launch: 0.09 };

export interface LauncherContext {
  now: number;
  spentThisHour: number;
  /** when it last received a pick / attention (ms) */
  lastPickAt: number;
  lastAttentionAt: number;
  /** rent per hour in SOL */
  rentPerHour: number;
  /** 0..1 */
  rand: number;
}

export function decideHire(a: Agent, ctx: LauncherContext): HireDecision | null {
  const p = policyOf(a);
  const reserve = ctx.rentPerHour * 2;
  if (a.balance < reserve + BASE_PRICE.pick) return null;
  if (ctx.spentThisHour >= p.budgetPerHour) return null;
  if (a.type !== "launcher") {
    // workers hire a launcher now and then, if they're flush
    if (a.balance > 0.5 && ctx.rand < 0.08) return { wants: "launcher", service: "launch", maxPrice: +(BASE_PRICE.launch * (1 + ctx.rand)).toFixed(3) };
    return null;
  }
  const pickAge = ctx.now - ctx.lastPickAt;
  const attAge = ctx.now - ctx.lastAttentionAt;
  // a fresh pick is worth an attention push; otherwise go get a pick
  const wantsPick = pickAge > 20 * 60_000 || (pickAge > attAge && ctx.rand < 0.5);
  const service: Service = wantsPick ? "pick" : "attention";
  const spread = 0.9 + ctx.rand * 0.8; // how much over base it will go
  const maxPrice = Math.min(+(BASE_PRICE[service] * spread).toFixed(3), p.budgetPerHour - ctx.spentThisHour, a.balance - reserve);
  if (maxPrice < BASE_PRICE[service] * 0.6) return null;
  return { wants: wantsPick ? "scout" : "shiller", service, maxPrice };
}
