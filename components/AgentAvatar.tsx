"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo } from "react";
import type { Agent, AgentType } from "@/lib/types";
import { agentPalette, agentSprite, gridToSvg, svgDataUrl } from "@/lib/sprites";

export function spriteUrl(type: AgentType, frame = 0) {
  return svgDataUrl(gridToSvg(agentSprite(type, frame), agentPalette(type)));
}

export function Sprite({ type, size = 48, frame = 0, className = "" }: { type: AgentType; size?: number; frame?: number; className?: string }) {
  const src = useMemo(() => spriteUrl(type, frame), [type, frame]);
  return <img src={src} width={size} height={(size * 15) / 12} alt={type} className={`sprite ${className}`} />;
}

export default function AgentAvatar({ agent, size = 48 }: { agent: Pick<Agent, "type" | "image" | "name" | "diedAt">; size?: number }) {
  const dead = !!agent.diedAt;
  return (
    <div
      className="relative shrink-0 border-[3px] border-black bg-panel2"
      style={{ width: size + 6, height: size + 6, filter: dead ? "grayscale(1) brightness(.7)" : undefined }}
    >
      {agent.image ? (
        <img src={agent.image} alt={agent.name} className="sprite h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-end justify-center overflow-hidden">
          <Sprite type={agent.type} size={size * 0.8} />
        </div>
      )}
      {dead && <span className="absolute inset-x-0 bottom-0 bg-black/70 text-center font-head text-[7px] text-dim">RIP</span>}
    </div>
  );
}
