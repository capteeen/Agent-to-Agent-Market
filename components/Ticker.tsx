"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useMarket } from "@/lib/store";
import type { MarketEvent } from "@/lib/types";

const KIND_STYLE: Record<MarketEvent["kind"], { tag: string; color: string }> = {
  hire: { tag: "HIRE", color: "#5bc0eb" },
  job_done: { tag: "PAID", color: "#5be37d" },
  fee: { tag: "FEE", color: "#f5a623" },
  launch: { tag: "LAUNCH", color: "#ffd23f" },
  death: { tag: "DEATH", color: "#e8453c" },
};

export function eventHref(e: MarketEvent) {
  return e.jobId ? `/jobs?job=${e.jobId}` : `/agent/${e.agentIds[0]}`;
}

export default function Ticker() {
  const events = useMarket((s) => s.events);
  const track = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const paused = useRef(false);
  const items = events.filter((e) => e.kind !== "hire").slice(0, 24);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      const el = track.current;
      if (el && !paused.current) {
        offset.current -= dt * 0.05;
        const half = el.scrollWidth / 2;
        if (half > 0 && -offset.current >= half) offset.current += half;
        el.style.transform = `translate3d(${Math.round(offset.current)}px,0,0)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const row = (k: string) =>
    items.map((e) => (
      <Link key={k + e.id} href={eventHref(e)} className="mx-5 inline-flex shrink-0 items-center gap-2 hover:underline">
        <span className="font-head text-[8px]" style={{ color: KIND_STYLE[e.kind].color }}>
          ▲{KIND_STYLE[e.kind].tag}
        </span>
        <span className="text-text">{e.text}</span>
      </Link>
    ));

  return (
    <div
      className="ticker-mask relative overflow-hidden border-y-[3px] border-black bg-panel2 py-1 text-[16px] leading-6"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div ref={track} className="flex w-max whitespace-nowrap will-change-transform">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}
