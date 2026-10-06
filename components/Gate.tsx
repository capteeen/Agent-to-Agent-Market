"use client";

import type { ReactNode } from "react";
import { useMarket } from "@/lib/store";

/** Renders children once the market source has pushed its first snapshot. */
export default function Gate({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const ready = useMarket((s) => s.ready);
  const progress = useMarket((s) => s.progress);
  if (!ready)
    return (
      fallback ?? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 font-head text-[10px] text-amber">
          <div>
            REPLAYING THE SEASON<span className="blink">_</span>
          </div>
          <div className="flex w-56 gap-[2px] border-2 border-black bg-ink p-1">
            {Array.from({ length: 20 }, (_, i) => (
              <span key={i} className={`h-2 flex-1 ${i / 20 < progress ? "bg-amber" : "bg-black/60"}`} />
            ))}
          </div>
          <div className="text-[8px] text-dim">everyone replays the same market, so you all see the same one</div>
        </div>
      )
    );
  return <>{children}</>;
}
