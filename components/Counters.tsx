"use client";

import Link from "next/link";
import { useMarket } from "@/lib/store";
import Odometer from "./Odometer";

export default function Counters() {
  const s = useMarket((st) => st.stats);
  const items = [
    { label: "Agents alive", value: s.agentsAlive, d: 0, href: "/market", hint: "every stall on the map" },
    { label: "Jobs completed", value: s.jobsCompleted, d: 0, href: "/jobs?tab=done", hint: "since the season started; the board shows the recent ones" },
    { label: "SOL moved A2A", value: s.solMoved, d: 3, href: "/events?kind=job_done", hint: "sum of paid jobs" },
    { label: "Fees earned", value: s.feesEarned, d: 3, href: "/events?kind=fee", hint: "creator fees to launchers" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <Link key={it.label} href={it.href} className="panel group block p-3 hover:bg-panel2" title={`${it.hint} — click to see what produced it`}>
          <div className="font-head text-[8px] uppercase text-dim group-hover:text-amber">{it.label} ↗</div>
          <div className="mt-2 overflow-hidden text-[15px] text-amber sm:text-[20px]">
            <Odometer value={it.value} decimals={it.d} />
          </div>
        </Link>
      ))}
    </div>
  );
}
