"use client";

import { useEffect, useRef, useState } from "react";
import { HOUR } from "@/lib/world";

const W = 168;
const H = 56;

/** 7d hourly balance as a chunky pixel line chart. */
export default function PnlChart({ series, now }: { series: number[]; now: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const min = Math.min(...series);
  const max = Math.max(...series);
  const first = series.find((v) => v > 0) ?? series[0];
  const last = series[series.length - 1];
  const up = last >= first;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    // grid
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let x = 0; x < W; x += 24) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 14) ctx.fillRect(0, y, W, 1);
    const span = max - min || 1;
    const yOf = (v: number) => Math.round(H - 3 - ((v - min) / span) * (H - 8));
    const line = up ? "#5be37d" : "#e8453c";
    const fill = up ? "rgba(91,227,125,0.18)" : "rgba(232,69,60,0.18)";
    let py = yOf(series[0]);
    for (let x = 0; x < series.length; x++) {
      const y = yOf(series[x]);
      ctx.fillStyle = fill;
      ctx.fillRect(x, y + 1, 1, H - y);
      ctx.fillStyle = line;
      const a = Math.min(py, y);
      const b = Math.max(py, y);
      ctx.fillRect(x, a, 1, b - a + 1);
      py = y;
    }
    if (hover !== null) {
      ctx.fillStyle = "#f5a623";
      ctx.fillRect(hover, 0, 1, H);
      ctx.fillRect(hover - 1, yOf(series[hover]) - 1, 3, 3);
    }
  }, [series, hover, min, max, up]);

  const idx = hover ?? series.length - 1;
  const at = now - (series.length - 1 - idx) * HOUR;
  const d = new Date(at);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-[16px]">
        <span className="text-dim">
          {hover === null ? "now" : `${d.toISOString().slice(5, 10)} ${String(d.getUTCHours()).padStart(2, "0")}:00 UTC`}
        </span>
        <span className="font-head text-[10px] text-text">{series[idx].toFixed(3)} ◎</span>
      </div>
      <canvas
        ref={ref}
        width={W}
        height={H}
        className="pixelated block h-40 w-full border-[3px] border-black bg-ink"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(W - 1, Math.floor(((e.clientX - r.left) / r.width) * W))));
        }}
        onPointerLeave={() => setHover(null)}
      />
      <div className="mt-1 flex justify-between text-[14px] text-dim">
        <span>7d ago</span>
        <span>
          low {min.toFixed(2)} · high {max.toFixed(2)} ·{" "}
          <span className={up ? "text-mint" : "text-blood"}>
            {up ? "+" : ""}
            {(last - first).toFixed(3)} ◎
          </span>
        </span>
      </div>
    </div>
  );
}
