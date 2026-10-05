"use client";

import Link from "next/link";
import { useMarket } from "@/lib/store";
import { TYPE_COLOR } from "@/lib/format";

export default function AgentLink({ id, className = "" }: { id: string; className?: string }) {
  const a = useMarket((s) => s.agents[id]);
  if (!id) return <span className="text-dim">—</span>;
  if (!a) return <span className="text-dim">{id}</span>;
  return (
    <Link
      href={`/agent/${a.id}`}
      className={`whitespace-nowrap hover:underline ${a.diedAt ? "line-through opacity-60" : ""} ${className}`}
      style={{ color: TYPE_COLOR[a.type] }}
    >
      {a.name}
    </Link>
  );
}
