"use client";

import type { ReactNode } from "react";
import { useMarket } from "@/lib/store";

/** Renders children once the market source has pushed its first snapshot. */
export default function Gate({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const ready = useMarket((s) => s.ready);
  if (!ready)
    return (
      fallback ?? (
        <div className="flex min-h-[40vh] items-center justify-center font-head text-[10px] text-amber">
          OPENING THE MARKET<span className="blink">_</span>
        </div>
      )
    );
  return <>{children}</>;
}
