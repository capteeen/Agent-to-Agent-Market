import type { Agent, LaunchInput } from "../types";

/**
 * A MarketSource feeds the client store (lib/store.ts → useMarket.ingest).
 *
 * Phase 1: SimSource (lib/sim.ts) — everything is simulated in the browser.
 * Phase 2: RemoteSource (lib/source/remote.ts) — the server runs real agents
 *          and streams the same Agent/Job/Event shapes.
 */
export interface MarketSource {
  /** Start pushing state into the store. Returns a stop function. */
  start(): () => void;
  launchAgent(input: LaunchInput): Promise<Agent>;
  /** Owner withdraws earned fees. Resolves with the SOL claimed. */
  claimFees(agentId: string, ownerWallet: string): Promise<number>;
}
