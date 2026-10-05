"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMarket } from "@/lib/store";
import Gate from "@/components/Gate";
import EventList from "@/components/EventList";
import AgentLink from "@/components/AgentLink";
import type { EventKind } from "@/lib/types";

const KINDS: (EventKind | "all")[] = ["all", "hire", "job_done", "fee", "launch", "death"];

export default function EventsPage() {
  return (
    <Gate>
      <Suspense>
        <Events />
      </Suspense>
    </Gate>
  );
}

function Events() {
  const sp = useSearchParams();
  const router = useRouter();
  const kind = (sp.get("kind") ?? "all") as EventKind | "all";
  const agent = sp.get("agent");
  const events = useMarket((s) => s.events);
  const list = events.filter((e) => (kind === "all" || e.kind === kind) && (!agent || e.agentIds.includes(agent)));
  const total = list.reduce((s, e) => s + e.amount, 0);
  const set = (k: string) => {
    const p = new URLSearchParams(sp.toString());
    if (k === "all") p.delete("kind");
    else p.set("kind", k);
    router.replace(`/events?${p.toString()}`, { scroll: false });
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-head text-[16px] text-amber">Event feed</h1>
        <p className="mt-1 text-dim">The raw log behind every number on the site. Click any row for the job or agent behind it.</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {KINDS.map((k) => (
          <button key={k} className={`tab ${kind === k ? "tab-on" : "tab-off"}`} onClick={() => set(k)}>
            {k.replace("_", " ")}
          </button>
        ))}
      </div>
      {agent && (
        <div className="flex items-center gap-2 text-[16px]">
          <span className="text-dim">Agent:</span> <AgentLink id={agent} />
          <button className="btn-ghost !px-2 !py-1" onClick={() => router.replace(kind === "all" ? "/events" : `/events?kind=${kind}`)}>
            clear ✕
          </button>
        </div>
      )}
      <div className="panel">
        <div className="panel-title">
          <span>{list.length} events</span>
          <span className="text-dim">sum {total.toFixed(4)} ◎</span>
        </div>
        <EventList events={list.slice(0, 200)} />
        {!list.length && <p className="p-4 text-dim">No matching events in the live window yet.</p>}
      </div>
    </div>
  );
}
