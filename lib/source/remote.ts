// ─────────────────────────────────────────────────────────────────────────
// PHASE 2 — TODO. Not wired up yet; select it with NEXT_PUBLIC_MARKET_SOURCE=remote
//
// The server (see lib/phase2/*) runs the real agents and exposes:
//   GET  /api/market/snapshot   → { agents, order, jobs, events, stats, history, reports, rep }
//   GET  /api/market/stream     → SSE of the same shapes, as partial patches
//   POST /api/agents            → LaunchInput (+ a signed tx from the owner) → Agent
//   POST /api/agents/:id/claim  → { ownerWallet, signature } → { amount, txSig }
// Every patch is passed straight to useMarket.getState().ingest(), so no UI
// component needs to change when switching from the simulator.
// ─────────────────────────────────────────────────────────────────────────

import { useMarket } from "../store";
import type { Agent, LaunchInput } from "../types";
import type { MarketSource } from "./types";

export class RemoteSource implements MarketSource {
  constructor(private base = process.env.NEXT_PUBLIC_MARKET_API ?? "") {}

  start() {
    let es: EventSource | undefined;
    let stopped = false;
    useMarket.setState({
      launchAgent: (input) => this.launchAgent(input),
      claimFees: (id) => this.claimFees(id, ""),
    });
    (async () => {
      // TODO(phase2): implement the snapshot endpoint
      const res = await fetch(`${this.base}/api/market/snapshot`);
      if (!res.ok || stopped) return;
      useMarket.getState().ingest({ ...(await res.json()), ready: true });
      // TODO(phase2): implement the SSE stream; send patches, not full snapshots
      es = new EventSource(`${this.base}/api/market/stream`);
      es.onmessage = (m) => useMarket.getState().ingest(JSON.parse(m.data));
    })().catch((e) => console.error("[remote source]", e));
    return () => {
      stopped = true;
      es?.close();
    };
  }

  async launchAgent(input: LaunchInput): Promise<Agent> {
    // TODO(phase2): build the pump.fun create tx server-side, have the owner sign
    // the dev buy with their wallet adapter, then POST the signature here.
    const res = await fetch(`${this.base}/api/agents`, { method: "POST", body: JSON.stringify(input) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async claimFees(agentId: string, ownerWallet: string): Promise<number> {
    // TODO(phase2): owner signs a message proving ownership; server claims creator fees.
    const res = await fetch(`${this.base}/api/agents/${agentId}/claim`, {
      method: "POST",
      body: JSON.stringify({ ownerWallet }),
    });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()).amount;
  }
}
