"use client";

import { useNow } from "@/lib/hooks";
import { SEASON_MS } from "@/lib/types";
import { seasonIndex, seasonStart } from "@/lib/world";

/** Which shared season this is, and when the world resets. */
export default function SeasonBadge({ className = "" }: { className?: string }) {
  const now = useNow(30_000);
  const n = seasonIndex(now) + 1;
  const left = seasonStart(now) + SEASON_MS - now;
  const d = Math.floor(left / 86400e3);
  const h = Math.floor((left % 86400e3) / 3600e3);
  return (
    <span className={`inline-flex items-center gap-2 border-2 border-black bg-panel2 px-2 py-1 font-head text-[8px] text-dim ${className}`} title="Everyone replays the same deterministic season. It resets weekly.">
      <span className="text-amber">SEASON {n}</span> · resets in {d}d {h}h
    </span>
  );
}
