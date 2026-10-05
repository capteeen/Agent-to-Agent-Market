// Pixel-art sprites as character grids. Pure data so they render both on the
// client (canvas) and on the server (OG images via next/og).

import type { AgentType } from "./types";

export type Grid = string[];
export type Palette = Record<string, string>;

const BODY_A: Grid = [
  "............",
  "....kkkk....",
  "...kHHHHk...",
  "..kHHHHHHk..",
  "..kssssssk..",
  "..ksessesk..",
  "..kssssssk..",
  "...kssssk...",
  "..kAAAAAAk..",
  ".kAAABBAAAk.",
  ".ksAAAAAAsk.",
  "..kAAAAAAk..",
  "...kDDDDk...",
  "...kDkkDk...",
  "...kkkkkk...",
];
// walking frame: legs apart
const LEGS_B: Grid = ["...kDDDDk...", "..kDk..kDk..", "..kk....kk.."];

const PALETTES: Record<AgentType, Palette> = {
  launcher: { k: "#1b1110", H: "#ff6b35", s: "#f2c79b", e: "#1b1110", A: "#e0571f", B: "#f5a623", D: "#4a2a1a", F: "#ffd23f", w: "#f4f4f2" },
  scout: { k: "#0f1a12", H: "#2f8f4e", s: "#e9b98e", e: "#0f1a12", A: "#3aa35c", B: "#c9f27a", D: "#2a3b2a", G: "#5bc0eb", w: "#f4f4f2" },
  shiller: { k: "#160f1f", H: "#8a4fff", s: "#f0c09a", e: "#160f1f", A: "#9b5cff", B: "#ff5fa2", D: "#3a2a55", M: "#f4f4f2", m: "#ff5fa2", w: "#f4f4f2" },
};

// type-specific overlays: [row, col, char]
const OVERLAYS: Record<AgentType, [number, number, string][]> = {
  // rocket fin + flame antenna
  launcher: [
    [0, 5, "F"], [0, 6, "F"], [1, 5, "k"], [1, 6, "k"],
    [9, 5, "B"], [9, 6, "B"],
  ],
  // goggles / binoculars
  scout: [
    [5, 3, "G"], [5, 4, "G"], [5, 7, "G"], [5, 8, "G"],
    [4, 3, "k"], [4, 4, "k"], [4, 7, "k"], [4, 8, "k"],
  ],
  // megaphone in right hand
  shiller: [
    [8, 10, "k"], [9, 10, "M"], [9, 11, "k"], [10, 10, "M"], [10, 11, "m"], [11, 10, "k"],
    [8, 11, "k"], [11, 11, "k"],
  ],
};

export function agentSprite(type: AgentType, frame = 0): Grid {
  const rows = BODY_A.map((r) => r.split(""));
  if (frame % 2 === 1) {
    LEGS_B.forEach((r, i) => (rows[12 + i] = r.split("")));
  }
  for (const [y, x, c] of OVERLAYS[type]) rows[y][x] = c;
  return rows.map((r) => r.join(""));
}

export const agentPalette = (type: AgentType): Palette => PALETTES[type];

export const COIN: Grid = [
  "..kkk..",
  ".kYYYk.",
  "kYwYYYk",
  "kYYbYYk",
  "kYYYYYk",
  ".kYYYk.",
  "..kkk..",
];
export const COIN_PAL: Palette = { k: "#5a3a00", Y: "#f5a623", w: "#fff6c8", b: "#c77d00" };

export const TOMB: Grid = [
  "..kkkk..",
  ".kGGGGk.",
  "kGGGGGGk",
  "kGGkkGGk",
  "kGkGGkGk",
  "kGGkkGGk",
  "kGGGGGGk",
  "kGGGGGGk",
  "kkkkkkkk",
];
export const TOMB_PAL: Palette = { k: "#2a2420", G: "#8d8579" };

export const BELL: Grid = [
  ".....kk.....",
  "....kYYk....",
  "...kYwYYk...",
  "..kYwYYYYk..",
  "..kYYYYYYk..",
  "..kYYYYYYk..",
  ".kYYYYYYYYk.",
  "kYYYYYYYYYYk",
  "kkkkkkkkkkkk",
  ".....kk.....",
  ".....kk.....",
];
export const BELL_PAL: Palette = { k: "#3a2400", Y: "#f5a623", w: "#fff1b0" };

/** Iterate solid pixels of a grid. */
export function eachPixel(grid: Grid, pal: Palette, fn: (x: number, y: number, color: string) => void) {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === ".") continue;
      const col = pal[c];
      if (col) fn(x, y, col);
    }
  }
}

/** Grid → SVG string (used for <img> avatars and OG images). */
export function gridToSvg(grid: Grid, pal: Palette, scale = 1): string {
  const w = grid[0].length;
  const h = grid.length;
  let rects = "";
  eachPixel(grid, pal, (x, y, c) => {
    rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`;
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
