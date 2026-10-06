// Pixel-art sprites as character grids. Pure data so they render both on the
// client (canvas) and on the server (OG images via next/og).

import type { AgentType } from "./types";

export type Grid = string[];
export type Palette = Record<string, string>;

export const SPRITE_W = 14;
export const SPRITE_H = 18;

// k outline · H/I hat main/shade · s skin · e eye · A/B/C shirt main/shade/light
// D pants · F boots · G glass/lens · Y badge · M/m megaphone · w white
const BODY: Grid = [
  "......kk......",
  "....kkHHkk....",
  "...kHHHHHHk...",
  "..kHHHHHHHHk..",
  "..kIIIIIIIIk..",
  "...kssssssk...",
  "...ksesssek...",
  "...kssssssk...",
  "....kssssk....",
  "..kkCAAAACkk..",
  ".ksAAAAAAAAsk.",
  ".kkAABBBBAAkk.",
  "...kBBBBBBk...",
  "...kDDDDDDk...",
  "...kDDkkDDk...",
  "...kFFk.kFFk..",
  "...kkkk.kkkk..",
  "..............",
];
// walking frame: legs apart, a little bounce handled by the renderer
const LEGS_WALK: Grid = ["..kDDDkkDDDk..", "..kDDk..kDDk..", ".kFFk....kFFk.", ".kkkk....kkkk.", ".............."];

const PALETTES: Record<AgentType, Palette> = {
  launcher: {
    k: "#1b1110", H: "#ff6b35", I: "#c44a1c", s: "#f2c79b", e: "#1b1110",
    A: "#e0571f", B: "#b8441c", C: "#ffa06e", D: "#4a2a1a", F: "#2a1a10", G: "#5bc0eb", Y: "#ffd23f", w: "#f4f4f2",
  },
  scout: {
    k: "#0f1a12", H: "#2f8f4e", I: "#1f6a37", s: "#e9b98e", e: "#0f1a12",
    A: "#3aa35c", B: "#237040", C: "#7fd99a", D: "#2a3b2a", F: "#162416", G: "#5bc0eb", Y: "#c9f27a", w: "#f4f4f2",
  },
  shiller: {
    k: "#160f1f", H: "#8a4fff", I: "#5f2fc4", s: "#f0c09a", e: "#160f1f",
    A: "#9b5cff", B: "#6a35c4", C: "#c9a6ff", D: "#3a2a55", F: "#1e1430", G: "#5bc0eb", M: "#f4f4f2", m: "#ff5fa2", Y: "#ff5fa2", w: "#f4f4f2",
  },
};

// type-specific overlays: [row, col, char]
const OVERLAYS: Record<AgentType, [number, number, string][]> = {
  // rocket helmet: visor goggles on the brim, a flame-coloured crest
  launcher: [
    [0, 6, "Y"], [0, 7, "Y"],
    [4, 3, "k"], [4, 4, "G"], [4, 5, "G"], [4, 6, "k"], [4, 7, "k"], [4, 8, "G"], [4, 9, "G"], [4, 10, "k"],
    [11, 6, "Y"], [11, 7, "Y"],
  ],
  // hood down the sides of the face, binoculars over the eyes
  scout: [
    [5, 3, "H"], [5, 10, "H"], [6, 3, "H"], [6, 10, "H"], [7, 3, "H"], [7, 10, "H"],
    [6, 4, "k"], [6, 5, "G"], [6, 6, "k"], [6, 7, "k"], [6, 8, "G"], [6, 9, "k"],
    [11, 4, "Y"], [11, 9, "Y"],
  ],
  // cap with a peak, megaphone in the right hand
  shiller: [
    [4, 11, "I"], [4, 12, "k"],
    [9, 11, "k"], [9, 12, "k"], [10, 12, "m"], [10, 13, "k"], [11, 12, "k"], [11, 13, "k"], [10, 11, "M"],
    [11, 6, "Y"], [11, 7, "Y"],
  ],
};

export function agentSprite(type: AgentType, frame = 0): Grid {
  const rows = BODY.map((r) => r.split(""));
  if (frame % 2 === 1) LEGS_WALK.forEach((r, i) => (rows[13 + i] = r.split("")));
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
  "kGgGGgGk",
  "kkkkkkkk",
];
export const TOMB_PAL: Palette = { k: "#2a2420", G: "#8d8579", g: "#6f685d" };

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
