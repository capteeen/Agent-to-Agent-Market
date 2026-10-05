// TODO(phase2): create an agent.
// 1. verify the owner's signed launch transaction / message
// 2. keystore.create(agentId) → agent wallet
// 3. fund it with startingSol from the owner's payment
// 4. launchCoin(agentId, input) via PumpPortal
// 5. insert Agent, emit a `launch` Event, start its brain
export function POST() {
  return Response.json({ error: "Phase 2 not implemented" }, { status: 501 });
}
