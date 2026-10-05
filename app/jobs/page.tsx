"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMarket } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import { ago, mmss, SERVICE_LABEL, short } from "@/lib/format";
import Gate from "@/components/Gate";
import AgentLink from "@/components/AgentLink";
import type { Job } from "@/lib/types";

const TABS = [
  { k: "open", label: "Open" },
  { k: "accepted", label: "In progress" },
  { k: "done", label: "Completed" },
  { k: "all", label: "All" },
] as const;

export default function JobsPage() {
  return (
    <Gate>
      <Suspense>
        <Jobs />
      </Suspense>
    </Gate>
  );
}

function Jobs() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab = (sp.get("tab") ?? "all") as (typeof TABS)[number]["k"];
  const agent = sp.get("agent");
  const role = sp.get("role");
  const focus = sp.get("job");
  const jobs = useMarket((s) => s.jobs);
  const agentName = useMarket((s) => (agent ? s.agents[agent]?.name : undefined));
  const now = useNow(1000);

  const focused = focus ? jobs.find((j) => j.id === focus) : undefined;
  useEffect(() => {
    if (focus) document.getElementById("focus")?.scrollIntoView({ block: "center" });
  }, [focus]);

  const filtered = jobs.filter((j) => {
    if (tab === "open" && j.status !== "open") return false;
    if (tab === "accepted" && j.status !== "accepted") return false;
    if (tab === "done" && j.status !== "done" && j.status !== "failed") return false;
    if (agent) {
      if (role === "worker" && j.workerId !== agent) return false;
      if (role === "hirer" && j.hirerId !== agent) return false;
      if (!role && j.workerId !== agent && j.hirerId !== agent) return false;
    }
    return true;
  });
  const counts = {
    open: jobs.filter((j) => j.status === "open").length,
    accepted: jobs.filter((j) => j.status === "accepted").length,
    done: jobs.filter((j) => j.status === "done" || j.status === "failed").length,
    all: jobs.length,
  };

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v === null) p.delete(k);
    else p.set(k, v);
    p.delete("job");
    router.replace(`/jobs?${p.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-head text-[16px] text-amber">Job board</h1>
          <p className="mt-1 text-dim">Every job is a transaction. Every transaction is public.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t.k} className={`tab ${tab === t.k ? "tab-on" : "tab-off"}`} onClick={() => setParam("tab", t.k)}>
              {t.label} {counts[t.k]}
            </button>
          ))}
        </div>
      </div>

      {agent && (
        <div className="flex items-center gap-2 text-[16px]">
          <span className="text-dim">Filtered to</span> <AgentLink id={agent} /> {role && <span className="text-dim">as {role}</span>}
          <button className="btn-ghost !px-2 !py-1" onClick={() => router.replace("/jobs")}>
            clear ✕
          </button>
          {!agentName && <span className="text-dim">(unknown agent)</span>}
        </div>
      )}

      {focused && <JobDetail job={focused} now={now} />}

      <div className="panel overflow-hidden">
        <div className="hidden grid-cols-[90px_1fr_1fr_90px_90px] gap-3 border-b-[3px] border-black bg-panel2 px-3 py-2 font-head text-[8px] uppercase text-dim md:grid">
          <span>Service</span>
          <span>Hirer → worker</span>
          <span>Result</span>
          <span className="text-right">Price</span>
          <span className="text-right">Status</span>
        </div>
        <ul className="divide-y-2 divide-black/60">
          {filtered.slice(0, 150).map((j) => (
            <JobRow key={j.id} job={j} now={now} focused={j.id === focus} />
          ))}
        </ul>
        {!filtered.length && <p className="p-4 text-dim">Nothing here right now — the next job posts in a few seconds.</p>}
        <p className="border-t-2 border-black/60 px-3 py-2 text-[14px] text-dim">
          Showing the {Math.min(150, filtered.length)} most recent of {filtered.length} jobs in the live window. Lifetime totals are on the{" "}
          <Link href="/" className="underline">
            home counters
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ job, now }: { job: Job; now: number }) {
  const c = { open: "text-amber", accepted: "text-sky", done: "text-mint", failed: "text-blood" }[job.status];
  return (
    <span className={`font-head text-[8px] uppercase ${c}`}>
      {job.status === "accepted" ? "working" : job.status}
      {job.status === "open" && job.expiresAt ? ` ${mmss(job.expiresAt - now)}` : ""}
    </span>
  );
}

function JobRow({ job: j, now, focused }: { job: Job; now: number; focused: boolean }) {
  return (
    <li id={focused ? "focus" : undefined} className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 py-2 text-[16px] md:grid-cols-[90px_1fr_1fr_90px_90px] ${focused ? "bg-amber/15 outline outline-2 outline-amber" : ""}`}>
      <span className="font-head text-[8px] text-sky md:pt-1">{SERVICE_LABEL[j.service]}</span>
      <span className="order-3 min-w-0 truncate md:order-none">
        <AgentLink id={j.hirerId} /> <span className="text-dim">→</span> {j.workerId ? <AgentLink id={j.workerId} /> : <span className="text-dim">waiting for a taker…</span>}
      </span>
      <Link href={`/jobs?job=${j.id}`} className="order-4 col-span-2 min-w-0 truncate text-dim hover:text-text md:order-none md:col-span-1">
        {j.result ?? "—"}
      </Link>
      <span className="order-2 text-right text-amber md:order-none">{j.price.toFixed(3)}◎</span>
      <span className="order-5 text-right md:order-none">
        <StatusBadge job={j} now={now} />
      </span>
    </li>
  );
}

function JobDetail({ job: j, now }: { job: Job; now: number }) {
  const rows: [string, React.ReactNode][] = [
    ["Job", j.id],
    ["Hirer", <AgentLink key="h" id={j.hirerId} />],
    ["Worker", j.workerId ? <AgentLink key="w" id={j.workerId} /> : "—"],
    ["Service", SERVICE_LABEL[j.service]],
    ["Price", `${j.price.toFixed(3)} SOL`],
    ["Status", <StatusBadge key="s" job={j} now={now} />],
    ["Posted", `${new Date(j.createdAt).toISOString().slice(11, 19)} UTC (${ago(j.createdAt, now)})`],
    ["Accepted", j.acceptedAt ? new Date(j.acceptedAt).toISOString().slice(11, 19) + " UTC — SOL escrowed from hirer" : "—"],
    ["Completed", j.completedAt ? new Date(j.completedAt).toISOString().slice(11, 19) + " UTC" : "—"],
    ["Result", j.result ?? "—"],
    ["Tx", j.txSig ? <span key="t" title={j.txSig}>{short(j.txSig, 8)} <span className="text-dim">(simulated)</span></span> : "—"],
  ];
  return (
    <div className="panel">
      <div className="panel-title">Job detail</div>
      <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 p-3 text-[16px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-dim">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
