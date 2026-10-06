// Phase 2 client: the server runs the market; this feeds its snapshot and
// SSE patches into the same store the simulator writes to. Owner actions are
// signed by the connected wallet (lib/api.ts) — the wallet is handed in by
// the UI at call time, so this source stays free of React.

import { useMarket, type MarketState } from "../store";
import type { Agent, Job, LaunchInput, MarketEvent, Policy } from "../types";
import { api, API_BASE } from "../api";
import type { MarketSource } from "./types";

interface Patch extends Partial<Pick<MarketState, "agents" | "order" | "jobs" | "events" | "stats" | "history" | "reports" | "rep" | "simTime">> {
  removed?: string[];
  ready?: boolean;
}

/** Merge a partial patch into the store; snapshots carry `order` and replace. */
export function applyPatch(p: Patch) {
  const s = useMarket.getState();
  const full = !!p.order;
  const agents = full ? (p.agents ?? {}) : { ...s.agents, ...(p.agents ?? {}) };
  for (const id of p.removed ?? []) delete agents[id];
  let order = p.order ?? s.order;
  if (!full) {
    for (const id of Object.keys(p.agents ?? {})) if (!order.includes(id)) order = [...order, id];
    if (p.removed?.length) order = order.filter((id) => !p.removed!.includes(id));
  }
  let jobs: Job[] = s.jobs;
  if (full) jobs = p.jobs ?? [];
  else if (p.jobs?.length) {
    const byId = new Map(s.jobs.map((j) => [j.id, j]));
    for (const j of p.jobs) byId.set(j.id, j);
    jobs = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 400);
  }
  let events: MarketEvent[] = s.events;
  if (full) events = p.events ?? [];
  else if (p.events?.length) events = [...p.events, ...s.events].slice(0, 400);
  useMarket.getState().ingest({
    ready: true,
    agents,
    order,
    jobs,
    events,
    stats: p.stats ?? s.stats,
    history: full ? (p.history ?? {}) : { ...s.history, ...(p.history ?? {}) },
    reports: p.reports ?? s.reports,
    rep: full ? (p.rep ?? {}) : { ...s.rep, ...(p.rep ?? {}) },
    simTime: p.simTime ?? Date.now(),
  });
}

export class RemoteSource implements MarketSource {
  private es?: EventSource;
  private stopped = false;

  start() {
    this.stopped = false;
    useMarket.setState({
      launchAgent: (input) => this.launchAgent(input),
      claimFees: (id) => this.claimFees(id),
      fundAgent: (id, sol) => this.fundAgent(id, sol),
      setPolicy: (id, p) => this.setPolicy(id, p),
    });
    const connect = () => {
      if (this.stopped) return;
      const es = new EventSource(`${API_BASE}/api/market/stream`);
      this.es = es;
      es.onmessage = (m) => applyPatch(JSON.parse(m.data));
      es.onerror = () => {
        es.close();
        if (!this.stopped) setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      this.stopped = true;
      this.es?.close();
    };
  }

  // The wallet is attached by the UI (components/WalletBridge.tsx) before any
  // owner action; without it these throw a clear error.
  private wallet() {
    const w = (globalThis as unknown as { __amWallet?: Parameters<typeof api.launch>[0] }).__amWallet;
    if (!w?.publicKey) throw new Error("connect a wallet first");
    return w;
  }

  async launchAgent(input: LaunchInput): Promise<Agent> {
    const r = await api.launch(this.wallet(), input);
    return { ...(r as unknown as Agent) };
  }

  async claimFees(agentId: string): Promise<number> {
    return (await api.claim(this.wallet(), agentId)).amount;
  }

  async fundAgent(agentId: string, sol: number): Promise<void> {
    const w = this.wallet();
    const health = await api.health();
    let txSig: string | undefined;
    if (health.settlement === "live") {
      // real top-up: the owner's wallet sends SOL to the agent wallet, then we prove it
      const agent = useMarket.getState().agents[agentId];
      if (!agent) throw new Error("unknown agent");
      const { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, clusterApiUrl } = await import("@solana/web3.js");
      const conn = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl(health.cluster as "devnet"), "confirmed");
      const wallet = w as unknown as { sendTransaction: (tx: InstanceType<typeof Transaction>, c: InstanceType<typeof Connection>) => Promise<string> };
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: w.publicKey!, toPubkey: new PublicKey(agent.wallet), lamports: Math.round(sol * LAMPORTS_PER_SOL) }),
      );
      txSig = await wallet.sendTransaction(tx, conn);
      await conn.confirmTransaction(txSig, "confirmed");
    }
    await api.fund(w, agentId, sol, txSig);
  }

  async setPolicy(agentId: string, policy: Policy): Promise<void> {
    await api.policy(this.wallet(), agentId, policy);
  }
}
