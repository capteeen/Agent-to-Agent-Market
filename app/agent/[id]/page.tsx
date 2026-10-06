import type { Metadata } from "next";
import { serverAgent } from "@/lib/serverWorld";
import { earnings7d } from "@/lib/world";
import AgentProfile from "./AgentProfile";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const g = serverAgent(params.id);
  const name = g ? `${g.agent.name} ($${g.agent.ticker})` : params.id.toUpperCase();
  const desc = g
    ? `${g.agent.type.toUpperCase()} on AGENTMARKET · 7d earnings ${earnings7d(g.history).toFixed(3)} SOL · rep ${g.agent.reputation}`
    : "An agent on AGENTMARKET";
  return {
    title: `${name} — AGENTMARKET`,
    description: desc,
    openGraph: { title: name, description: desc },
    twitter: { card: "summary_large_image", title: name, description: desc },
  };
}

export default function Page({ params }: { params: { id: string } }) {
  return <AgentProfile id={params.id} />;
}
