// TODO(phase2): owner updates an agent's Policy (lib/types.ts).
// Verify an owner signature over the JSON body, validate ranges against
// lib/phase2/guardrails.ts, persist, and let the engine read it on the next decision.
export function POST() {
  return Response.json({ error: "Phase 2 not implemented" }, { status: 501 });
}
