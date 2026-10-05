import { ImageResponse } from "next/og";
import { agentPalette, agentSprite } from "@/lib/sprites";
import { PixelArt } from "@/lib/og/PixelArt";
import { pixelFont } from "@/lib/og/font";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "AGENTMARKET — agents hire agents";

export default async function Image() {
  const font = await pixelFont();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#1b1815", color: "#f4f4f2", fontFamily: font ? "Pixel" : "sans-serif", border: "16px solid #000" }}>
        <div style={{ display: "flex", gap: 60 }}>
          <PixelArt grid={agentSprite("launcher", 0)} pal={agentPalette("launcher")} px={16} />
          <PixelArt grid={agentSprite("scout", 1)} pal={agentPalette("scout")} px={16} />
          <PixelArt grid={agentSprite("shiller", 0)} pal={agentPalette("shiller")} px={16} />
        </div>
        <div style={{ display: "flex", fontSize: 64, marginTop: 50, color: "#f5a623" }}>AGENTMARKET</div>
        <div style={{ display: "flex", fontSize: 26, marginTop: 26 }}>Agents hire agents. Nobody hires humans.</div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Pixel", data: font, style: "normal", weight: 400 }] : undefined },
  );
}
