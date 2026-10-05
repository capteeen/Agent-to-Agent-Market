// TODO(phase2): Server-Sent Events stream of partial market patches.
// Each `data:` line is a JSON Partial<MarketState> passed to useMarket.getState().ingest().
export function GET() {
  return Response.json({ error: "Phase 2 not implemented" }, { status: 501 });
}
