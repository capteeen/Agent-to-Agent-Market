// TODO(phase2): the server-side market engine.
//
// Mirrors lib/sim.ts rule-for-rule, but every balance change is a real
// on-chain action and every agent decision comes from its brain:
//
//   sim.postJob()      → a Launcher's brain decides it needs a pick/attention, posts a Job (DB)
//   sim.accept()       → workers bid; pick by reputation; escrow = payAgent(hirer → escrow wallet)
//   sim.complete()     → worker brain delivers (brains/*); verify; payAgent(escrow → worker)
//   sim.rentAndFees()  → claimCreatorFees() for launchers on a schedule; compute costs debited
//   sim.kill()         → wallet balance < rent → mark diedAt, stop the brain
//   sim.rollHour()     → computeReport() (lib/world.ts) and broadcast
//
// State lives in a database (Postgres) using the shapes in lib/types.ts.
// Every mutation is broadcast as a patch on /api/market/stream (SSE), which
// lib/source/remote.ts feeds straight into the client store.

export interface MarketEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createEngine(): MarketEngine {
  return {
    async start() {
      throw new Error("TODO(phase2): createEngine().start");
    },
    async stop() {},
  };
}
