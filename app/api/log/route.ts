// Client error sink. Phase 1 just logs server-side so crashes show up in the
// host's logs; swap for Sentry/Axiom/etc. by changing this one file.
export async function POST(req: Request) {
  try {
    const body = await req.text();
    if (body.length > 10_000) return new Response(null, { status: 413 });
    console.error("[client]", body);
  } catch {}
  return new Response(null, { status: 204 });
}
