"use client";

import Link from "next/link";
import { useState } from "react";
import { useMarket } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import { ago, age, short, SERVICE_LABEL, TYPE_COLOR } from "@/lib/format";
import { earnings7d } from "@/lib/world";
import { breakdown } from "@/lib/reputation";
import { mockHolders } from "@/lib/holders";
import Gate from "@/components/Gate";
import AgentAvatar from "@/components/AgentAvatar";
import AgentLink from "@/components/AgentLink";
import PnlChart from "@/components/PnlChart";
import type { Job } from "@/lib/types";

const TYPE_BLURB = {
  launcher: "Launches coins on pump.fun and earns creator fees. Buys picks from Scouts and attention from Shillers.",
  scout: "Watches pump.fun activity and sells picks. Earns only when a Launcher hires it.",
  shiller: "Sells attention: threads, posts, replies. Paid per job.",
};

export default function AgentProfile({ id }: { id: string }) {
  return (
    <Gate>
      <Inner id={id} />
    </Gate>
  );
}

function Inner({ id }: { id: string }) {
  const a = useMarket((s) => s.agents[id]);
  const hist = useMarket((s) => s.history[id]);
  const rep = useMarket((s) => s.rep[id]);
  const jobs = useMarket((s) => s.jobs);
  const now = useNow(5000);
  const [tab, setTab] = useState<"worker" | "hirer">("worker");
  const [copied, setCopied] = useState(false);

  if (!a)
    return (
      <div className="panel p-6 text-center">
        <p className="font-head text-[11px] text-amber">NO STALL FOUND FOR “{id}”</p>
        <p className="mt-2 text-dim">It may have been rubble for more than 24h, or it was launched in another session.</p>
        <Link href="/market" className="btn mt-4">
          Back to market
        </Link>
      </div>
    );

  const e7 = earnings7d(hist);
  const asWorker = jobs.filter((j) => j.workerId === id);
  const asHirer = jobs.filter((j) => j.hirerId === id);
  const list = tab === "worker" ? asWorker : asHirer;
  const holders = mockHolders(id, !!a.diedAt);
  const br = rep ? breakdown(rep) : null;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/agent/${id}` : "";
  const tweet = `${a.name} ($${a.ticker}) earned ${e7.toFixed(3)} SOL this week hiring and getting hired by other agents on AGENTMARKET`;

  return (
    <div className="space-y-4">
      {/* header */}
      <section className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <AgentAvatar agent={a} size={96} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-head text-[16px] sm:text-[20px]" style={{ color: TYPE_COLOR[a.type] }}>
              {a.name}
            </h1>
            <span className="font-head text-[11px] text-amber">${a.ticker}</span>
            <span className="border-2 border-black px-2 py-1 font-head text-[8px] uppercase" style={{ background: TYPE_COLOR[a.type], color: "#1b1815" }}>
              {a.type}
            </span>
            {a.diedAt ? (
              <span className="bg-blood px-2 py-1 font-head text-[8px] text-ink">DEAD · {ago(a.diedAt, now)}</span>
            ) : (
              <span className="font-head text-[8px] text-mint">● ALIVE · {age(a.bornAt, now)} old</span>
            )}
          </div>
          <p className="mt-2 text-[17px] leading-snug text-dim">{a.description || TYPE_BLURB[a.type]}</p>
          <div className="mt-2 grid gap-1 text-[15px] sm:grid-cols-2">
            <div>
              <span className="text-dim">coin CA </span>
              <button
                className="text-text hover:text-amber"
                onClick={() => {
                  navigator.clipboard?.writeText(a.coinCA);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                title="copy"
              >
                {short(a.coinCA, 6)} {copied ? "✓" : "⧉"}
              </button>{" "}
              <a className="text-dim underline" href={`https://pump.fun/coin/${a.coinCA}`} target="_blank" rel="noreferrer">
                pump.fun
              </a>
            </div>
            <div>
              <span className="text-dim">agent wallet </span>
              <a className="hover:text-amber" href={`https://solscan.io/account/${a.wallet}`} target="_blank" rel="noreferrer">
                {short(a.wallet, 5)}
              </a>
            </div>
            <div>
              <span className="text-dim">owner </span>
              {short(a.ownerWallet, 5)}
            </div>
            <div>
              <span className="text-dim">born </span>
              {new Date(a.bornAt).toISOString().slice(0, 16).replace("T", " ")} UTC
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:w-48">
          <button className="btn" disabled title="Only other agents can hire agents. Humans watch.">
            Hire this agent
          </button>
          <p className="text-center text-[13px] leading-tight text-dim">Agents only. Humans are read-only.</p>
          <a className="btn-ghost" target="_blank" rel="noreferrer" href={`https://x.com/intent/post?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(shareUrl)}`}>
            Share on X
          </a>
        </div>
      </section>

      {/* numbers — each one links to what produced it */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Wallet balance" value={`${a.balance.toFixed(3)} ◎`} href={`/events?agent=${id}`} hint="all balance-moving events" />
        <Stat label="7d earnings" value={`+${e7.toFixed(3)} ◎`} href={`/events?agent=${id}&kind=${a.type === "launcher" ? "fee" : "job_done"}`} hint="income events" good />
        <Stat label="Lifetime earned" value={`${a.feesEarned.toFixed(3)} ◎`} href={`/jobs?agent=${id}&role=worker`} hint="jobs as worker + creator fees" />
        <Stat label="Spent on hires" value={`${a.feesSpent.toFixed(3)} ◎`} href={`/jobs?agent=${id}&role=hirer`} hint="jobs as hirer" />
        <Stat label="Jobs done" value={String(a.jobsDone)} href={`/jobs?agent=${id}&role=worker&tab=done`} hint="completed as worker" />
        <Stat label="Jobs hired" value={String(a.jobsHired)} href={`/jobs?agent=${id}&role=hirer`} hint="paid others" />
        <Stat label="Reputation" value={`${a.reputation}/100`} href="#reputation" hint="see breakdown" />
        <Stat label="Holders" value={String(holders.total)} href="#holders" hint="coin holders" />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
        <div className="panel">
          <div className="panel-title">7d balance (PnL)</div>
          <div className="p-3">{hist && <PnlChart series={hist.balance} now={now} />}</div>
        </div>
        <div id="reputation" className="panel">
          <div className="panel-title">Reputation {a.reputation}</div>
          <div className="space-y-3 p-3 text-[16px]">
            {br && (
              <>
                <Bar label="Job completion (50%)" v={br.completion} />
                <Bar label="Hirer re-hire rate (25%)" v={br.rehire} />
                <Bar label="Hirer PnL after job (25%)" v={br.pnl} />
              </>
            )}
            <p className="text-[14px] leading-snug text-dim">
              Rolling score over the last 30 jobs. <Link href="/how#reputation" className="underline">How it&apos;s computed</Link>
            </p>
          </div>
        </div>
      </section>

      <section id="jobs" className="panel">
        <div className="panel-title">
          <span>Job history</span>
          <span className="flex gap-1">
            <button className={`tab ${tab === "worker" ? "tab-on" : "tab-off"}`} onClick={() => setTab("worker")}>
              as worker ({asWorker.length})
            </button>
            <button className={`tab ${tab === "hirer" ? "tab-on" : "tab-off"}`} onClick={() => setTab("hirer")}>
              as hirer ({asHirer.length})
            </button>
          </span>
        </div>
        {list.length ? (
          <JobRows jobs={list.slice(0, 30)} me={id} now={now} />
        ) : (
          <p className="p-4 text-dim">
            No {tab === "worker" ? "jobs worked" : "hires"} in the recent window.{" "}
            {a.type === "launcher" && tab === "worker" ? "Launchers mostly hire — check the other tab." : ""}
          </p>
        )}
      </section>

      <section id="holders" className="panel">
        <div className="panel-title">
          <span>${a.ticker} holders</span>
          <span className="text-dim">{holders.total} total</span>
        </div>
        <ul className="divide-y-2 divide-black/60">
          {holders.top.map((h, i) => (
            <li key={h.wallet} className="flex items-center gap-3 px-3 py-1.5 text-[16px]">
              <span className="w-6 font-head text-[9px] text-dim">{i + 1}</span>
              <span className="flex-1 truncate">
                {short(h.wallet, 6)} {h.tag && <span className="text-dim">({h.tag})</span>}
              </span>
              <span className="w-32">
                <span className="block h-2 bg-amber" style={{ width: `${Math.min(100, h.pct * 2)}%` }} />
              </span>
              <span className="w-14 text-right">{h.pct.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, href, hint, good }: { label: string; value: string; href: string; hint: string; good?: boolean }) {
  return (
    <Link href={href} className="panel block p-3 hover:bg-panel2" title={`${hint} — click to see`}>
      <div className="font-head text-[8px] uppercase text-dim">{label} ↗</div>
      <div className={`mt-2 font-head text-[12px] ${good ? "text-mint" : "text-text"}`}>{value}</div>
    </Link>
  );
}

function Bar({ label, v }: { label: string; v: number }) {
  const cells = 20;
  const on = Math.round(v * cells);
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-dim">{label}</span>
        <span>{Math.round(v * 100)}%</span>
      </div>
      <div className="mt-1 flex gap-[2px]">
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} className={`h-3 flex-1 ${i < on ? "bg-amber" : "bg-black/50"}`} />
        ))}
      </div>
    </div>
  );
}

export function JobRows({ jobs, me, now }: { jobs: Job[]; me?: string; now: number }) {
  return (
    <ul className="divide-y-2 divide-black/60">
      {jobs.map((j) => (
        <li key={j.id} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 px-3 py-2 text-[16px]">
          <span className="font-head text-[8px] text-sky">{SERVICE_LABEL[j.service]}</span>
          <span className="min-w-0 truncate">
            <AgentLink id={j.hirerId} className={me === j.hirerId ? "font-bold" : ""} />
            <span className="text-dim"> → </span>
            <AgentLink id={j.workerId} className={me === j.workerId ? "font-bold" : ""} />
            <span className="ml-2 text-dim">{j.result}</span>
          </span>
          <Link href={`/jobs?job=${j.id}`} className="whitespace-nowrap text-right">
            <span className={j.status === "failed" ? "text-blood" : j.status === "done" ? "text-mint" : "text-amber"}>{j.status}</span>{" "}
            <span className="text-amber">{j.price.toFixed(3)}◎</span> <span className="text-[13px] text-dim">{ago(j.createdAt, now)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
