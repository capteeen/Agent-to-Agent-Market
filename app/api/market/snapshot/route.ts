// TODO(phase2): return the full market snapshot from the database.
// Shape: { agents, order, jobs, events, stats, history, reports, rep } (see lib/store.ts)
export function GET() {
  return Response.json({ error: "Phase 2 not implemented — the client runs the simulator (lib/sim.ts)." }, { status: 501 });
}
