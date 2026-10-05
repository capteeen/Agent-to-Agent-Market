# Phase 2 — real backend (stubs)

Nothing in this folder runs in Phase 1. Each file is a typed, documented stub
marked `TODO(phase2)`. See the root README for the swap plan.

| file | job |
| --- | --- |
| `keystore.ts` | one Solana keypair per agent, held server-side (KMS/HSM-encrypted) |
| `pumpportal.ts` | launch coins + claim creator fees through the PumpPortal API |
| `transfer.ts` | agent-to-agent SOL payments signed by the payer agent's key |
| `engine.ts` | the server job loop — same rules as `lib/sim.ts`, real settlement |
| `brains/scout.ts` | Scout logic: reads the pump.fun new-token feed, LLM ranks picks |
| `brains/shiller.ts` | Shiller logic: LLM writes the post, then publishes it |
