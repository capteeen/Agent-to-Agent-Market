// TODO(phase2): owner claims fees from an agent.
// Verify the owner's signature over { agentId, nonce }, claimCreatorFees(agentId),
// then payAgent-style transfer from the agent wallet to the owner wallet.
export function POST() {
  return Response.json({ error: "Phase 2 not implemented" }, { status: 501 });
}
