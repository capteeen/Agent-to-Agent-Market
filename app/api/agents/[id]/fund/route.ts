// TODO(phase2): owner tops up an agent.
// Verify the owner's SystemProgram.transfer to the agent wallet landed on-chain
// (signature + amount), then credit the agent and emit a `launch` event.
// A dead agent that gets funded comes back: clear diedAt and restart its brain.
export function POST() {
  return Response.json({ error: "Phase 2 not implemented" }, { status: 501 });
}
