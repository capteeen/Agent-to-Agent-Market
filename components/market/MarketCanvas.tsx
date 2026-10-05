"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMarket } from "@/lib/store";
import type { AgentType } from "@/lib/types";
import { earnings7d } from "@/lib/world";
import { TYPE_COLOR } from "@/lib/format";
import { MarketEngine } from "./engine";
import AgentAvatar from "../AgentAvatar";

interface Props {
  cols?: number;
  rows?: number;
  filter?: AgentType | "all";
  className?: string;
}

export default function MarketCanvas({ cols = 7, rows = 6, filter = "all", className = "" }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const engine = useRef<MarketEngine | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!cvs.current || !wrap.current) return;
    const e = new MarketEngine(cvs.current, { cols, rows, onSelect: setSelected, onHover: () => {} });
    const q = new URLSearchParams(window.location.search).get("hour");
    if (q !== null) e.forceHour = Number(q);
    engine.current = e;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      e.resize(width, height);
    });
    ro.observe(wrap.current);
    e.start();
    return () => {
      ro.disconnect();
      e.stop();
    };
  }, [cols, rows]);

  useEffect(() => {
    if (engine.current) engine.current.filter = filter;
  }, [filter]);

  return (
    <div ref={wrap} className={`relative overflow-hidden bg-black select-none ${className}`}>
      <canvas
        ref={cvs}
        className="pixelated absolute inset-0 h-full w-full touch-none"
        style={{ cursor: "grab" }}
        aria-label="Isometric market: each stall is an agent"
      />
      <Clock />
      <Legend />
      {selected && <StallCard id={selected} onClose={() => { setSelected(null); if (engine.current) engine.current.selected = null; }} />}
    </div>
  );
}

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const f = () => {
      const d = new Date();
      const h = d.getUTCHours();
      const phase = h >= 6 && h < 18 ? "DAY" : "NIGHT";
      setT(`UTC ${String(h).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} · ${phase}`);
    };
    f();
    const i = setInterval(f, 10_000);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="pointer-events-none absolute right-2 top-2 border-2 border-black bg-ink/80 px-2 py-1 font-head text-[8px] text-amber">
      {t}
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex gap-2 sm:bottom-auto sm:top-2 border-2 border-black bg-ink/80 px-2 py-1 font-head text-[8px]">
      {(["launcher", "scout", "shiller"] as const).map((t) => (
        <span key={t} style={{ color: TYPE_COLOR[t] }}>
          ■ {t.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

function StallCard({ id, onClose }: { id: string; onClose: () => void }) {
  const a = useMarket((s) => s.agents[id]);
  const e7 = useMarket((s) => earnings7d(s.history[id]));
  if (!a) return null;
  return (
    <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center gap-3 border-[3px] border-black bg-panel p-2 shadow-px sm:right-auto sm:w-80">
      <AgentAvatar agent={a} size={48} />
      <div className="min-w-0 flex-1 font-body text-sm leading-tight">
        <div className="truncate font-head text-[10px]" style={{ color: TYPE_COLOR[a.type] }}>
          {a.name} <span className="text-amber">${a.ticker}</span>
        </div>
        {a.diedAt ? (
          <div className="text-dim">RIP — wallet hit 0. Rubble clears in 24h.</div>
        ) : (
          <div className="text-dim">
            bal <span className="text-text">{a.balance.toFixed(3)}</span> · 7d <span className="text-mint">+{e7.toFixed(3)}</span> · rep{" "}
            <span className="text-text">{a.reputation}</span>
          </div>
        )}
        <Link href={`/agent/${a.id}`} className="font-head text-[9px] text-amber underline">
          OPEN STALL →
        </Link>
      </div>
      <button onClick={onClose} className="self-start font-head text-[10px] text-dim hover:text-text" aria-label="close">
        ✕
      </button>
    </div>
  );
}
