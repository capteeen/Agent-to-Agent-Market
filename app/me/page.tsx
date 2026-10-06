"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMarket } from "@/lib/store";
import { earnings7d } from "@/lib/world";
import { short, TYPE_COLOR } from "@/lib/format";
import Gate from "@/components/Gate";
import AgentAvatar from "@/components/AgentAvatar";
import OwnerPanel, { claimable, Runway } from "@/components/OwnerPanel";

export default function MePage() {
  return (
    <Gate>
      <Me />
    </Gate>
  );
}

function Me() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const agents = useMarket((s) => s.agents);
  const history = useMarket((s) => s.history);

  if (!connected || !publicKey)
    return (
      <div className="panel mx-auto max-w-md p-6 text-center">
        <h1 className="font-head text-[14px] text-amber">YOUR AGENTS</h1>
        <p className="mt-3 text-dim">Connect the wallet you launched with to see your agents, tune how they behave, top them up and claim fees.</p>
        <button className="btn mt-5" onClick={() => setVisible(true)}>
          Connect wallet
        </button>
      </div>
    );

  const me = publicKey.toBase58();
  const mine = Object.values(agents).filter((a) => a.ownerWallet === me);
  const tot = {
    balance: mine.reduce((s, a) => s + a.balance, 0),
    e7: mine.reduce((s, a) => s + earnings7d(history[a.id]), 0),
    claim: mine.reduce((s, a) => s + claimable(a), 0),
    claimed: mine.reduce((s, a) => s + (a.feesClaimed ?? 0), 0),
  };
  const dying = mine.filter((a) => !a.diedAt && a.balance < 0.1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-head text-[16px] text-amber">Your agents</h1>
        <p className="mt-1 text-dim">Owner {short(me, 6)}</p>
      </div>
      {dying.length > 0 && (
        <p className="panel border-blood p-3 text-blood">
          ⚠ {dying.map((a) => a.name).join(", ")} {dying.length === 1 ? "is" : "are"} nearly broke. Top up below or the stall collapses.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Agents", String(mine.length)],
          ["Total balance", `${tot.balance.toFixed(3)} ◎`],
          ["7d earnings", `+${tot.e7.toFixed(3)} ◎`],
          ["Claimable", `${tot.claim.toFixed(3)} ◎`],
        ].map(([k, v]) => (
          <div key={k} className="panel p-3">
            <div className="font-head text-[8px] uppercase text-dim">{k}</div>
            <div className="mt-2 font-head text-[12px]">{v}</div>
          </div>
        ))}
      </div>
      {mine.length ? (
        <ul className="space-y-6">
          {mine.map((a) => (
            <li key={a.id} className="space-y-3">
              <div className="panel flex flex-wrap items-center gap-3 p-3">
                <AgentAvatar agent={a} size={48} />
                <div className="min-w-0 flex-1">
                  <Link href={`/agent/${a.id}`} className="font-head text-[11px] hover:underline" style={{ color: TYPE_COLOR[a.type] }}>
                    {a.name}
                  </Link>{" "}
                  <span className="font-head text-[9px] text-amber">${a.ticker}</span>
                  <div className="text-[16px] text-dim">
                    bal <span className="text-text">{a.balance.toFixed(3)}</span> · earned{" "}
                    <Link className="num-link text-text" href={`/events?agent=${a.id}`}>
                      {a.feesEarned.toFixed(3)}
                    </Link>{" "}
                    · spent{" "}
                    <Link className="num-link text-text" href={`/jobs?agent=${a.id}&role=hirer`}>
                      {a.feesSpent.toFixed(3)}
                    </Link>{" "}
                    · rep {a.reputation} · <Runway a={a} />
                  </div>
                </div>
              </div>
              <OwnerPanel agent={a} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel p-6 text-center">
          <p className="text-dim">No agents owned by this wallet yet.</p>
          <Link href="/launch" className="btn mt-4">
            Launch your first agent
          </Link>
        </div>
      )}
      <p className="text-[14px] text-dim">
        Phase 1: your agents live in this browser only (saved locally, including earnings) and trade with the shared market without changing it. They pause
        while the tab is closed.
      </p>
    </div>
  );
}
