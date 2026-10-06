"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMarket, useUi } from "@/lib/store";
import { runwayHours } from "@/lib/world";
import { sfx } from "@/lib/sound";
import { DEFAULT_POLICY, type Agent, type Policy } from "@/lib/types";

export function claimable(a: Agent) {
  return a.diedAt ? 0 : Math.max(0, Math.min(a.feesEarned - (a.feesClaimed ?? 0), a.balance * 0.5));
}

export function Runway({ a }: { a: Agent }) {
  const h = useMarket((s) => s.history[a.id]);
  if (a.diedAt) return <span className="text-blood">dead</span>;
  const r = runwayHours(a, h);
  if (!isFinite(r)) return <span className="text-mint">earning more than it burns</span>;
  const txt = r < 1 ? `~${Math.max(1, Math.round(r * 60))} min` : r < 48 ? `~${r.toFixed(0)}h` : `~${(r / 24).toFixed(0)}d`;
  return <span className={r < 2 ? "text-blood" : r < 12 ? "text-amber" : "text-text"}>{txt} of runway</span>;
}

/** Owner controls for one of your agents: knobs, top-up, claim. */
export default function OwnerPanel({ agent: a }: { agent: Agent }) {
  const { publicKey, signMessage } = useWallet();
  const fundAgent = useMarket((s) => s.fundAgent);
  const claimFees = useMarket((s) => s.claimFees);
  const setPolicy = useMarket((s) => s.setPolicy);
  const [policy, setLocal] = useState<Policy>(a.policy ?? DEFAULT_POLICY);
  const [topUp, setTopUp] = useState(0.25);
  const [busy, setBusy] = useState<"" | "fund" | "claim">("");
  const [msg, setMsg] = useState("");

  useEffect(() => setLocal(a.policy ?? DEFAULT_POLICY), [a.policy]);

  const isOwner = publicKey?.toBase58() === a.ownerWallet;
  if (!a.local || !isOwner) return null;

  const save = (p: Partial<Policy>) => {
    const next = { ...policy, ...p };
    setLocal(next);
    void setPolicy(a.id, next);
  };

  async function fund() {
    setBusy("fund");
    setMsg("");
    try {
      // Phase 1: sign to prove ownership. Phase 2: sign the actual transfer.
      if (signMessage) await signMessage(new TextEncoder().encode(`AGENTMARKET top up ${a.name} ${topUp} SOL ${Date.now()}`));
      await fundAgent(a.id, topUp);
      if (useUi.getState().sound) sfx.launch();
      setMsg(`Topped up ${topUp.toFixed(3)} SOL (simulated).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
    setBusy("");
  }

  async function claim() {
    setBusy("claim");
    setMsg("");
    const amt = await claimFees(a.id);
    if (useUi.getState().sound && amt > 0) sfx.coin();
    setMsg(amt > 0 ? `Claimed ${amt.toFixed(4)} SOL to your wallet (simulated).` : "Nothing to claim yet.");
    setBusy("");
  }

  const c = claimable(a);
  return (
    <div className="panel">
      <div className="panel-title">
        <span>Owner controls</span>
        <Runway a={a} />
      </div>
      <div className="grid gap-4 p-3 text-[16px] md:grid-cols-2">
        <div className="space-y-3">
          <div className="font-head text-[8px] uppercase text-dim">How it behaves</div>
          <Knob label="Asking price" value={`×${policy.priceMult.toFixed(2)}`} hint="higher = earns more per job, gets hired less">
            <input type="range" min={0.5} max={2} step={0.05} value={policy.priceMult} onChange={(e) => save({ priceMult: Number(e.target.value) })} className="w-full accent-amber" />
          </Knob>
          <Knob label="Hiring budget" value={`${policy.budgetPerHour.toFixed(2)} ◎/h`} hint="max it spends hiring per hour">
            <input type="range" min={0} max={5} step={0.1} value={policy.budgetPerHour} onChange={(e) => save({ budgetPerHour: Number(e.target.value) })} className="w-full accent-amber" />
          </Knob>
          <Knob label="Who it hires" value={policy.risk === "best" ? "best reputation" : "cheapest ask"} hint="reputation costs more but pays off">
            <div className="flex gap-1">
              <button className={`tab ${policy.risk === "best" ? "tab-on" : "tab-off"}`} onClick={() => save({ risk: "best" })}>
                best
              </button>
              <button className={`tab ${policy.risk === "cheap" ? "tab-on" : "tab-off"}`} onClick={() => save({ risk: "cheap" })}>
                cheap
              </button>
            </div>
          </Knob>
          <Knob label="Auto-claim above" value={policy.autoClaimAt ? `${policy.autoClaimAt.toFixed(2)} ◎` : "off"} hint="sweeps the excess to you; keeps this much working">
            <input type="range" min={0} max={5} step={0.25} value={policy.autoClaimAt} onChange={(e) => save({ autoClaimAt: Number(e.target.value) })} className="w-full accent-amber" />
          </Knob>
        </div>
        <div className="space-y-3">
          <div className="font-head text-[8px] uppercase text-dim">Money</div>
          <div className="border-[3px] border-black bg-ink p-3">
            <div className="flex items-center justify-between">
              <span>Claimable now</span>
              <span className="font-head text-[10px] text-amber">{c.toFixed(4)} ◎</span>
            </div>
            <p className="mt-1 text-[14px] leading-snug text-dim">
              Earned {a.feesEarned.toFixed(3)} − claimed {(a.feesClaimed ?? 0).toFixed(3)}, capped at half the balance so it can keep hiring.
            </p>
            <button className="btn mt-2 w-full" disabled={busy !== "" || c <= 0} onClick={claim}>
              {busy === "claim" ? "Claiming…" : `Claim ${c.toFixed(3)} ◎`}
            </button>
          </div>
          <div className="border-[3px] border-black bg-ink p-3">
            <div className="flex items-center justify-between">
              <span>{a.diedAt ? "Revive with" : "Top up"}</span>
              <input className="input w-28 !py-1 text-right" type="number" min={0.05} step={0.05} value={topUp} onChange={(e) => setTopUp(Number(e.target.value))} />
            </div>
            <p className="mt-1 text-[14px] leading-snug text-dim">
              {a.diedAt ? "A dead agent is still yours. Fund it and the stall reopens." : "More SOL in the wallet = longer runway and bigger hires."}
            </p>
            <button className="btn-ghost mt-2 w-full" disabled={busy !== "" || topUp <= 0} onClick={fund}>
              {busy === "fund" ? "Sign in your wallet…" : `${a.diedAt ? "Revive" : "Add"} ${topUp.toFixed(3)} ◎`}
            </button>
          </div>
          {msg && <p className="text-mint">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

function Knob({ label, value, hint, children }: { label: string; value: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="text-amber">{value}</span>
      </div>
      {children}
      <div className="text-[13px] text-dim">{hint}</div>
    </label>
  );
}
