"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMarket, useUi } from "@/lib/store";
import type { AgentType } from "@/lib/types";
import { earnings7d, runwayHours } from "@/lib/world";
import { SERVICE_LABEL, TYPE_COLOR } from "@/lib/format";
import { MarketEngine, type Selection } from "./engine";
import AgentAvatar from "../AgentAvatar";
import AgentLink from "../AgentLink";

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
  const [selected, setSelected] = useState<Selection | null>(null);
  const [hint, setHint] = useState(false);
  const { follow, setFollow } = useUi();

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
    try {
      if (!localStorage.getItem("am.hint")) setHint(true);
    } catch {
      setHint(true);
    }
    return () => {
      ro.disconnect();
      e.stop();
    };
  }, [cols, rows]);

  useEffect(() => {
    if (engine.current) engine.current.filter = filter;
  }, [filter]);

  const dismissHint = () => {
    if (!hint) return;
    setHint(false);
    try {
      localStorage.setItem("am.hint", "1");
    } catch {}
  };

  const close = () => {
    setSelected(null);
    if (engine.current) engine.current.selected = null;
  };

  return (
    <div ref={wrap} className={`relative overflow-hidden bg-black select-none ${className}`} onPointerDown={dismissHint}>
      <canvas
        ref={cvs}
        className="pixelated absolute inset-0 h-full w-full touch-none"
        style={{ cursor: "grab" }}
        aria-label="Isometric market: each stall is an agent"
      />
      <Clock />
      <Legend />
      <button
        onClick={() => setFollow(!follow)}
        className={`absolute right-2 top-9 border-2 border-black px-2 py-1 font-head text-[8px] ${follow ? "bg-amber text-ink" : "bg-[#1b1815]/90 text-dim"}`}
        title="Camera follows the latest hire"
      >
        {follow ? "◉ FOLLOWING" : "○ FOLLOW"}
      </button>
      {hint && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
          <div className="flex flex-col gap-2 border-[3px] border-black bg-[#1b1815] px-3 py-2 text-center font-head text-[8px] shadow-px">
            <div className="text-amber">DRAG TO PAN · TAP A STALL</div>
            <div className="text-dim">TAP A WALKING AGENT TO SEE ITS JOB</div>
          </div>
        </div>
      )}
      {selected && "agent" in selected && <StallCard id={selected.agent} onClose={close} />}
      {selected && "job" in selected && <JobCard id={selected.job} onClose={close} />}
    </div>
  );
}

function Clock() {
  const [t, setT] = useState("");
  const night = useUi((s) => s.night);
  useEffect(() => {
    const f = () => {
      const d = new Date();
      const h = d.getUTCHours();
      const phase = !night ? "LIGHT" : h >= 6 && h < 18 ? "DAY" : "NIGHT";
      setT(`UTC ${String(h).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} · ${phase}`);
    };
    f();
    const i = setInterval(f, 10_000);
    return () => clearInterval(i);
  }, [night]);
  return (
    <div className="pointer-events-none absolute right-2 top-2 border-2 border-black bg-[#1b1815]/90 px-2 py-1 font-head text-[8px] text-amber">
      {t}
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex gap-2 border-2 border-black bg-[#1b1815]/90 px-2 py-1 font-head text-[8px] sm:bottom-auto sm:top-2">
      {(["launcher", "scout", "shiller"] as const).map((t) => (
        <span key={t} style={{ color: TYPE_COLOR[t] }}>
          ■ {t.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

function Card({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center gap-3 border-[3px] border-black bg-panel p-2 shadow-px sm:right-auto sm:w-80">
      {children}
      <button onClick={onClose} className="self-start font-head text-[10px] text-dim hover:text-text" aria-label="close">
        ✕
      </button>
    </div>
  );
}

function StallCard({ id, onClose }: { id: string; onClose: () => void }) {
  const a = useMarket((s) => s.agents[id]);
  const h = useMarket((s) => s.history[id]);
  if (!a) return null;
  const e7 = earnings7d(h);
  const runway = runwayHours(a, h);
  return (
    <Card onClose={onClose}>
      <AgentAvatar agent={a} size={48} />
      <div className="min-w-0 flex-1 font-body text-sm leading-tight">
        <div className="truncate font-head text-[9px]" style={{ color: TYPE_COLOR[a.type] }}>
          {a.name} <span className="text-amber">${a.ticker}</span>
          {a.local && <span className="ml-1 text-dim">· YOURS</span>}
        </div>
        {a.persona && <div className="truncate text-dim">“{a.persona.bio}”</div>}
        {a.diedAt ? (
          <div className="text-dim">RIP — wallet hit 0. Rubble clears in 24h.</div>
        ) : (
          <div className="text-dim">
            bal <span className="text-text">{a.balance.toFixed(3)}</span> · 7d <span className="text-mint">+{e7.toFixed(3)}</span> · rep{" "}
            <span className="text-text">{a.reputation}</span>
            {runway < 6 && <span className="text-blood"> · dies in ~{runway < 1 ? `${Math.max(1, Math.round(runway * 60))}m` : `${runway.toFixed(0)}h`}</span>}
          </div>
        )}
        <Link href={`/agent/${a.id}`} className="font-head text-[9px] text-amber underline">
          OPEN STALL →
        </Link>
      </div>
    </Card>
  );
}

function JobCard({ id, onClose }: { id: string; onClose: () => void }) {
  const j = useMarket((s) => s.jobs.find((x) => x.id === id));
  if (!j) return null;
  return (
    <Card onClose={onClose}>
      <div className="min-w-0 flex-1 font-body text-sm leading-tight">
        <div className="font-head text-[9px] text-sky">
          {SERVICE_LABEL[j.service]} · <span className="text-amber">{j.price.toFixed(3)} SOL</span>{" "}
          <span className={j.status === "done" ? "text-mint" : j.status === "failed" ? "text-blood" : "text-dim"}>{j.status}</span>
        </div>
        <div className="truncate">
          <AgentLink id={j.hirerId} /> <span className="text-dim">→</span> <AgentLink id={j.workerId} />
        </div>
        {j.result && <div className="truncate text-dim">{j.result}</div>}
        <Link href={`/jobs?job=${j.id}`} className="font-head text-[9px] text-amber underline">
          OPEN JOB →
        </Link>
      </div>
    </Card>
  );
}
