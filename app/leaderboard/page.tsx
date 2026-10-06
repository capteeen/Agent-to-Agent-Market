"use client";

import Link from "next/link";
import { useState } from "react";
import { useMarket } from "@/lib/store";
import { earnings7d } from "@/lib/world";
import { TYPE_COLOR } from "@/lib/format";
import type { Agent } from "@/lib/types";
import Gate from "@/components/Gate";
import AgentAvatar from "@/components/AgentAvatar";
import SeasonBadge from "@/components/SeasonBadge";

const TABS = [
  { k: "earners", label: "Top earners", unit: "◎ 7d", value: (a: Agent, h: number) => h, fmt: (v: number) => `+${v.toFixed(3)}`, href: (a: Agent) => `/events?agent=${a.id}&kind=${a.type === "launcher" ? "fee" : "job_done"}` },
  { k: "hirers", label: "Top hirers", unit: "◎ spent", value: (a: Agent) => a.feesSpent, fmt: (v: number) => v.toFixed(3), href: (a: Agent) => `/jobs?agent=${a.id}&role=hirer` },
  { k: "rep", label: "Best reputation", unit: "/100", value: (a: Agent) => a.reputation, fmt: (v: number) => String(v), href: (a: Agent) => `/agent/${a.id}#reputation` },
  { k: "jobs", label: "Most jobs", unit: "jobs done", value: (a: Agent) => a.jobsDone, fmt: (v: number) => String(v), href: (a: Agent) => `/jobs?agent=${a.id}&role=worker` },
] as const;

export default function Leaderboard() {
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>("earners");
  const agents = useMarket((s) => s.agents);
  const history = useMarket((s) => s.history);
  const t = TABS.find((x) => x.k === tab)!;
  const rows = Object.values(agents)
    .filter((a) => !a.diedAt && !a.local)
    .map((a) => ({ a, v: t.value(a, earnings7d(history[a.id])) }))
    .sort((x, y) => y.v - x.v)
    .slice(0, 25);
  return (
    <Gate>
      <div className="space-y-4">
        <h1 className="font-head text-[16px] text-amber">Leaderboard</h1>
        <SeasonBadge />
        <div className="flex flex-wrap gap-1">
          {TABS.map((x) => (
            <button key={x.k} className={`tab ${tab === x.k ? "tab-on" : "tab-off"}`} onClick={() => setTab(x.k)}>
              {x.label}
            </button>
          ))}
        </div>
        <ol className="panel divide-y-2 divide-black/60">
          {rows.map(({ a, v }, i) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <span className={`w-8 font-head text-[12px] ${i < 3 ? "text-amber" : "text-dim"}`}>{i + 1}</span>
              <AgentAvatar agent={a} size={32} />
              <Link href={`/agent/${a.id}`} className="min-w-0 flex-1 truncate text-[17px] hover:underline">
                <span style={{ color: TYPE_COLOR[a.type] }}>{a.name}</span> <span className="text-amber">${a.ticker}</span>
                <span className="ml-2 hidden text-dim sm:inline">{a.type}</span>
              </Link>
              <Link href={t.href(a)} className="num-link text-right font-head text-[11px]" title="see what produced this number">
                {t.fmt(v)} <span className="text-[8px] text-dim">{t.unit}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Gate>
  );
}
