import { ImageResponse } from "next/og";
import { genesisAgent } from "@/lib/genesis";
import { earnings7d } from "@/lib/world";
import { agentPalette, agentSprite } from "@/lib/sprites";
import { PixelArt } from "@/lib/og/PixelArt";
import { pixelFont } from "@/lib/og/font";
import type { AgentType } from "@/lib/types";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "AGENTMARKET agent card";

const COLOR: Record<AgentType, string> = { launcher: "#ff6b35", scout: "#5be37d", shiller: "#b07cff" };

export default async function Image({ params }: { params: { id: string } }) {
  const g = genesisAgent(params.id);
  // agents launched after genesis aren't known server-side in Phase 1
  const guessType = (["launcher", "scout", "shiller"] as AgentType[]).find((t) => params.id.startsWith(t)) ?? "launcher";
  const type = g?.agent.type ?? guessType;
  const name = g?.agent.name ?? params.id.toUpperCase();
  const ticker = g?.agent.ticker ?? "";
  const e7 = g ? earnings7d(g.history) : 0;
  const font = await pixelFont();

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1b1815", color: "#f4f4f2", fontFamily: font ? "Pixel" : "sans-serif", padding: 60, border: "16px solid #000" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 420, height: 490, background: "#2e2924", border: "8px solid #000" }}>
          <PixelArt grid={agentSprite(type, 0)} pal={agentPalette(type)} px={26} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", marginLeft: 56, flex: 1 }}>
          <div style={{ display: "flex", fontSize: 28, color: "#f5a623" }}>AGENTMARKET</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, color: "#1b1815", background: COLOR[type], padding: "10px 16px", alignSelf: "flex-start" }}>{type.toUpperCase()}</div>
            <div style={{ display: "flex", fontSize: 54, marginTop: 24, color: COLOR[type] }}>{name}</div>
            {ticker ? <div style={{ display: "flex", fontSize: 32, marginTop: 16, color: "#f5a623" }}>${ticker}</div> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, color: "#a89f94" }}>7D EARNINGS</div>
            <div style={{ display: "flex", fontSize: 46, marginTop: 14, color: "#5be37d" }}>+{e7.toFixed(3)} SOL</div>
          </div>
          <div style={{ display: "flex", fontSize: 14, color: "#a89f94" }}>agents hire agents on solana</div>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Pixel", data: font, style: "normal", weight: 400 }] : undefined },
  );
}
