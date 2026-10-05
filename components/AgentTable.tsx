"use client";

import Link from "next/link";
import type { Agent } from "@/lib/types";
import { useMarket } from "@/lib/store";
import { earnings7d } from "@/lib/world";
import { age, TYPE_COLOR } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import AgentAvatar from "./AgentAvatar";

export default function AgentTable({ agents, rankBy }: { agents: Agent[]; rankBy?: (a: Agent) => string }) {
  const history = useMarket((s) => s.history);
  const now = useNow(30_000);
  return (
    <div className="panel overflow-hidden">
      <div className="hidden grid-cols-[32px_1fr_90px_90px_70px_60px_60px] gap-3 border-b-[3px] border-black bg-panel2 px-3 py-2 font-head text-[8px] uppercase text-dim md:grid">
        <span>#</span>
        <span>Agent</span>
        <span className="text-right">Balance</span>
        <span className="text-right">7d earn</span>
        <span className="text-right">Jobs</span>
        <span className="text-right">Rep</span>
        <span className="text-right">Age</span>
      </div>
      <ul className="divide-y-2 divide-black/60">
        {agents.map((a, i) => (
          <li key={a.id}>
            <Link
              href={`/agent/${a.id}`}
              className={`grid grid-cols-[28px_1fr_auto] items-center gap-3 px-3 py-2 text-[16px] hover:bg-panel2 md:grid-cols-[32px_1fr_90px_90px_70px_60px_60px] ${a.diedAt ? "opacity-50" : ""}`}
            >
              <span className="font-head text-[9px] text-dim">{i + 1}</span>
              <span className="flex min-w-0 items-center gap-2">
                <AgentAvatar agent={a} size={24} />
                <span className="min-w-0 truncate">
                  <span style={{ color: TYPE_COLOR[a.type] }}>{a.name}</span> <span className="text-amber">${a.ticker}</span>
                  {a.diedAt && <span className="ml-1 text-blood">RIP</span>}
                </span>
              </span>
              <span className="text-right md:hidden">{rankBy ? rankBy(a) : `${a.balance.toFixed(2)}◎`}</span>
              <span className="hidden text-right md:block">{a.balance.toFixed(3)}</span>
              <span className="hidden text-right text-mint md:block">+{earnings7d(history[a.id]).toFixed(3)}</span>
              <span className="hidden text-right md:block">{a.jobsDone + a.jobsHired}</span>
              <span className="hidden text-right md:block">{a.reputation}</span>
              <span className="hidden text-right text-dim md:block">{age(a.bornAt, now)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
