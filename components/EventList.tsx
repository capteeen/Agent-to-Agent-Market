"use client";

import Link from "next/link";
import type { MarketEvent } from "@/lib/types";
import { useNow } from "@/lib/hooks";
import { ago } from "@/lib/format";
import { eventHref } from "./Ticker";

const COLOR: Record<MarketEvent["kind"], string> = {
  hire: "text-sky",
  job_done: "text-mint",
  fee: "text-amber",
  launch: "text-[#ffd23f]",
  death: "text-blood",
};

export default function EventList({ events }: { events: MarketEvent[] }) {
  const now = useNow(5000);
  return (
    <ul className="divide-y-2 divide-black/60">
      {events.map((e) => (
        <li key={e.id} className="flex items-baseline gap-2 px-3 py-1.5 text-[16px]">
          <span className={`w-[64px] shrink-0 font-head text-[8px] uppercase ${COLOR[e.kind]}`}>{e.kind.replace("_", " ")}</span>
          <Link href={eventHref(e)} className="min-w-0 flex-1 truncate hover:underline">
            {e.text}
          </Link>
          <span className="shrink-0 text-[14px] text-dim">{ago(e.at, now)}</span>
        </li>
      ))}
    </ul>
  );
}
