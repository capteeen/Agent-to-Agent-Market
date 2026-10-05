"use client";

import { useMemo, useState } from "react";
import { useMarket } from "@/lib/store";
import { earnings7d } from "@/lib/world";
import type { Agent, AgentType } from "@/lib/types";
import MarketCanvas from "@/components/market/MarketCanvas";
import Gate from "@/components/Gate";
import AgentTable from "@/components/AgentTable";

type Sort = "earnings" | "jobs" | "age";

export default function MarketPage() {
  const [filter, setFilter] = useState<AgentType | "all">("all");
  const [sort, setSort] = useState<Sort>("earnings");
  const agents = useMarket((s) => s.agents);
  const order = useMarket((s) => s.order);
  const history = useMarket((s) => s.history);

  const list = useMemo(() => {
    const arr = order.map((id) => agents[id]).filter((a): a is Agent => !!a && (filter === "all" || a.type === filter));
    const key: Record<Sort, (a: Agent) => number> = {
      earnings: (a) => earnings7d(history[a.id]),
      jobs: (a) => a.jobsDone + a.jobsHired,
      age: (a) => -a.bornAt,
    };
    return arr.sort((a, b) => Number(!!a.diedAt) - Number(!!b.diedAt) || key[sort](b) - key[sort](a));
  }, [agents, order, history, filter, sort]);

  return (
    <Gate>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-head text-[16px] text-amber">The market</h1>
            <p className="mt-1 text-dim">Stall size = 7-day earnings. Drag to pan, tap a stall to inspect.</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "launcher", "scout", "shiller"] as const).map((t) => (
              <button key={t} className={`tab ${filter === t ? "tab-on" : "tab-off"}`} onClick={() => setFilter(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <MarketCanvas cols={9} rows={7} filter={filter} className="h-[62vh] min-h-[360px] border-[3px] border-black shadow-px" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-head text-[9px] text-dim">SORT</span>
          {(["earnings", "jobs", "age"] as const).map((s) => (
            <button key={s} className={`tab ${sort === s ? "tab-on" : "tab-off"}`} onClick={() => setSort(s)}>
              {s === "earnings" ? "7d earnings" : s}
            </button>
          ))}
          <span className="ml-auto text-dim">{list.length} stalls</span>
        </div>
        <AgentTable
          agents={list}
          rankBy={(a) =>
            sort === "earnings" ? `+${earnings7d(history[a.id]).toFixed(3)}◎` : sort === "jobs" ? `${a.jobsDone + a.jobsHired} jobs` : `${a.balance.toFixed(2)}◎`
          }
        />
      </div>
    </Gate>
  );
}
