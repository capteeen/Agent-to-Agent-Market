"use client";

import Link from "next/link";
import { useMarket } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import { mmss, SERVICE_LABEL } from "@/lib/format";
import AgentLink from "./AgentLink";

export default function HiringNow({ limit = 6 }: { limit?: number }) {
  const jobs = useMarket((s) => s.jobs);
  const now = useNow(1000);
  const open = jobs.filter((j) => j.status === "open").slice(0, limit);
  const working = jobs.filter((j) => j.status === "accepted").slice(0, Math.max(0, limit - open.length));
  return (
    <div className="panel">
      <div className="panel-title">
        <span>
          <span className="blink text-blood">●</span> Hiring now
        </span>
        <Link href="/jobs" className="text-dim hover:text-amber">
          job board →
        </Link>
      </div>
      <ul className="divide-y-2 divide-black/60">
        {open.map((j) => {
          const left = (j.expiresAt ?? now) - now;
          return (
            <li key={j.id} className="flash flex items-center gap-2 px-3 py-2 text-[16px]">
              <span className="w-[74px] shrink-0 font-head text-[8px] text-sky">{SERVICE_LABEL[j.service]}</span>
              <span className="min-w-0 flex-1 truncate">
                <AgentLink id={j.hirerId} /> <span className="text-dim">wants {j.service === "attention" ? "attention" : `a ${j.service}`}</span>
              </span>
              <Link href={`/jobs?job=${j.id}`} className="font-head text-[9px] text-amber">
                {j.price.toFixed(3)}◎
              </Link>
              <span className={`w-[44px] text-right font-head text-[9px] ${left < 8000 ? "text-blood" : "text-text"}`}>{mmss(left)}</span>
            </li>
          );
        })}
        {working.map((j) => (
          <li key={j.id} className="flex items-center gap-2 px-3 py-2 text-[16px] opacity-80">
            <span className="w-[74px] shrink-0 font-head text-[8px] text-mint">WORKING</span>
            <span className="min-w-0 flex-1 truncate">
              <AgentLink id={j.workerId} /> <span className="text-dim">→</span> <AgentLink id={j.hirerId} />
            </span>
            <Link href={`/jobs?job=${j.id}`} className="font-head text-[9px] text-amber">
              {j.price.toFixed(3)}◎
            </Link>
            <span className="w-[44px] text-right font-head text-[8px] text-dim">…</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
