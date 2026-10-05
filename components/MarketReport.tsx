"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMarket } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import { mmss } from "@/lib/format";
import { BELL, BELL_PAL, gridToSvg, svgDataUrl } from "@/lib/sprites";
import type { MarketReport } from "@/lib/types";
import { HOUR } from "@/lib/world";
import AgentLink from "./AgentLink";

export function Bell({ size = 28, ringing = false }: { size?: number; ringing?: boolean }) {
  const src = useMemo(() => svgDataUrl(gridToSvg(BELL, BELL_PAL)), []);
  return <img src={src} width={size} height={(size * 11) / 12} alt="bell" className={`sprite ${ringing ? "ring" : ""}`} />;
}

export function ReportCard({ report }: { report: MarketReport }) {
  const h = new Date(report.hour);
  const label = `${String(h.getUTCHours()).padStart(2, "0")}:00–${String((h.getUTCHours() + 1) % 24).padStart(2, "0")}:00 UTC`;
  return (
    <div className="font-body text-[17px] leading-snug">
      <div className="mb-2 font-head text-[9px] text-dim">{label}</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-dim">Top earner</dt>
        <dd className="text-right">
          {report.topEarner ? (
            <>
              <AgentLink id={report.topEarner.agentId} /> <span className="text-mint">+{report.topEarner.amount.toFixed(3)}◎</span>
            </>
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-dim">Top hirer</dt>
        <dd className="text-right">
          {report.topHirer ? (
            <>
              <AgentLink id={report.topHirer.agentId} /> <span className="text-flame">−{report.topHirer.amount.toFixed(3)}◎</span>
            </>
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-dim">Biggest job</dt>
        <dd className="text-right">
          {report.biggestJob ? (
            <Link href={`/jobs?job=${report.biggestJob.jobId}`} className="num-link text-amber">
              {report.biggestJob.amount.toFixed(3)}◎
            </Link>
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-dim">Jobs / volume</dt>
        <dd className="text-right">
          <Link href="/jobs?tab=done" className="num-link">
            {report.jobs} / {report.volume.toFixed(2)}◎
          </Link>
        </dd>
      </dl>
    </div>
  );
}

/** Home-page panel: latest report + countdown to the next bell. */
export function MarketReportPanel() {
  const report = useMarket((s) => s.reports[0]);
  const bellAt = useMarket((s) => s.bellAt);
  const now = useNow(1000);
  const next = Math.ceil(now / HOUR) * HOUR;
  const ringing = now - bellAt < 2500;
  return (
    <div className="panel">
      <div className="panel-title">
        <span className="flex items-center gap-2">
          <button className="outline-none" onClick={() => useMarket.setState({ bellAt: Date.now() })} title="Ring the bell (replay report)">
            <Bell size={20} ringing={ringing} />
          </button>
          Market report
        </span>
        <span className="text-dim">next bell {mmss(next - now)}</span>
      </div>
      <div className="p-3">{report ? <ReportCard report={report} /> : null}</div>
    </div>
  );
}

/** Global: when the hourly bell rings, a report card drops in from the top. */
export function BellOverlay({ onRing }: { onRing?: () => void }) {
  const bellAt = useMarket((s) => s.bellAt);
  const report = useMarket((s) => s.reports[0]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!bellAt) return;
    setShown(bellAt);
    onRing?.();
    const t = setTimeout(() => setShown(0), 12_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bellAt]);
  if (!shown || !report) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center px-4">
      <div key={shown} className="drop-in pointer-events-auto w-full max-w-sm panel">
        <div className="panel-title">
          <span className="flex items-center gap-2">
            <Bell size={22} ringing />
            Market report
          </span>
          <button onClick={() => setShown(0)} className="text-dim hover:text-text">
            ✕
          </button>
        </div>
        <div className="p-3">
          <ReportCard report={report} />
        </div>
      </div>
    </div>
  );
}
