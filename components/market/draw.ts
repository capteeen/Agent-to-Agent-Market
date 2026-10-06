// Crisp isometric primitives built from 1px fillRects (canvas paths would
// anti-alias edges, which breaks the pixel look once upscaled).

import type { AgentType } from "@/lib/types";
import { agentPalette, agentSprite, eachPixel, TOMB, TOMB_PAL, COIN, COIN_PAL, type Grid, type Palette } from "@/lib/sprites";

export const TW = 32;
export const TH = 16;

type Ctx = CanvasRenderingContext2D;

export function diamond(ctx: Ctx, cx: number, cy: number, hw: number, color: string) {
  const hh = hw / 2;
  ctx.fillStyle = color;
  for (let dy = -hh; dy < hh; dy++) {
    const t = 1 - Math.abs(dy + 0.5) / hh;
    const w = Math.round(hw * t);
    if (w > 0) ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2, 1);
  }
}

/** face hanging below the edge from the left corner to the bottom corner */
export function leftFace(ctx: Ctx, cx: number, cy: number, hw: number, h: number, color: string) {
  ctx.fillStyle = color;
  for (let x = 0; x < hw; x++) ctx.fillRect(Math.round(cx - hw + x), Math.round(cy + x / 2), 1, h);
}

/** face hanging below the edge from the bottom corner to the right corner */
export function rightFace(ctx: Ctx, cx: number, cy: number, hw: number, h: number, color: string) {
  ctx.fillStyle = color;
  for (let x = 0; x < hw; x++) ctx.fillRect(Math.round(cx + x), Math.round(cy + hw / 2 - x / 2), 1, h);
}

export function box(ctx: Ctx, cx: number, groundY: number, hw: number, h: number, top: string, left: string, right: string) {
  const ty = groundY - h;
  leftFace(ctx, cx, ty, hw, h, left);
  rightFace(ctx, cx, ty, hw, h, right);
  diamond(ctx, cx, ty, hw, top);
}

export function blit(ctx: Ctx, grid: Grid, pal: Palette, x: number, y: number) {
  eachPixel(grid, pal, (px, py, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + px, y + py, 1, 1);
  });
}

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export const TYPE_TONES: Record<AgentType, { base: string; light: string; dark: string; darker: string }> = {
  launcher: { base: "#ff6b35", light: "#ffa06e", dark: "#b8441c", darker: "#7a2c12" },
  scout: { base: "#3aa35c", light: "#7fd99a", dark: "#237040", darker: "#164a2a" },
  shiller: { base: "#9b5cff", light: "#c9a6ff", dark: "#6a35c4", darker: "#44207f" },
};

// ───────────────────────────── sprites ─────────────────────────────

export interface SpriteSet {
  frames: HTMLCanvasElement[]; // [frame0, frame1, frame0 flipped, frame1 flipped]
}

export function buildSprites(): Record<AgentType, SpriteSet> {
  const out = {} as Record<AgentType, SpriteSet>;
  for (const t of ["launcher", "scout", "shiller"] as AgentType[]) {
    const frames: HTMLCanvasElement[] = [];
    for (const flip of [false, true]) {
      for (const f of [0, 1]) {
        const g = agentSprite(t, f);
        const [c, ctx] = canvas(g[0].length, g.length);
        eachPixel(g, agentPalette(t), (x, y, col) => {
          ctx.fillStyle = col;
          ctx.fillRect(flip ? g[0].length - 1 - x : x, y, 1, 1);
        });
        frames.push(c);
      }
    }
    out[t] = { frames };
  }
  return out;
}

export function buildCoin() {
  const [c, ctx] = canvas(7, 7);
  blit(ctx, COIN, COIN_PAL, 0, 0);
  return c;
}

// ───────────────────────────── stalls ─────────────────────────────

// three visible tiers: the top earners should look like it
export const STALL_SIZES = [
  { hw: 10, H: 24 },
  { hw: 14, H: 31 },
  { hw: 19, H: 40 },
];

export interface StallImg {
  under: HTMLCanvasElement;
  over: HTMLCanvasElement;
  ax: number; // anchor (ground center) inside the images
  ay: number;
  hw: number;
  H: number;
}

export function buildStall(type: AgentType, size: number): StallImg {
  const { hw, H } = STALL_SIZES[size];
  const hh = hw / 2;
  const w = hw * 2 + 8;
  const h = H + hw + 14;
  const ax = w / 2;
  const ay = h - hh - 3;
  const tone = TYPE_TONES[type];

  // under: floor planks
  const [under, u] = canvas(w, h);
  diamond(u, ax, ay, hw, "#4e331d");
  diamond(u, ax, ay, hw - 2, "#6b4a2c");
  u.fillStyle = "#5c3d24";
  for (let dy = -hh + 2; dy < hh - 1; dy += 2) {
    const t = 1 - Math.abs(dy + 0.5) / hh;
    const ww = Math.round((hw - 2) * t);
    if (ww > 0) u.fillRect(Math.round(ax - ww), Math.round(ay + dy), ww * 2, 1);
  }
  // back post
  u.fillStyle = "#3a2414";
  u.fillRect(Math.round(ax) - 1, Math.round(ay - hh - H + 4), 2, H - 4);

  // over: counter, side posts, awning
  const [over, o] = canvas(w, h);
  const cw = Math.round(hw * 0.78);
  box(o, ax, ay + hh * 0.5, cw, 6, "#b07a48", "#6b4425", "#4e301a");
  // counter front trim in the agent's colour
  leftFace(o, ax, ay + hh * 0.5 - 6, cw, 1, tone.base);
  rightFace(o, ax, ay + hh * 0.5 - 6, cw, 1, tone.dark);
  // goods on the counter
  o.fillStyle = "#f5a623";
  o.fillRect(Math.round(ax - 4), Math.round(ay + hh * 0.5 - 8), 2, 2);
  o.fillStyle = tone.light;
  o.fillRect(Math.round(ax + 2), Math.round(ay + hh * 0.5 - 9), 2, 3);
  // side posts
  o.fillStyle = "#3a2414";
  o.fillRect(Math.round(ax - hw) + 1, Math.round(ay - H + 2), 2, H - 2);
  o.fillRect(Math.round(ax + hw) - 3, Math.round(ay - H + 2), 2, H - 2);
  // awning: striped diamond + valance
  const aw = hw + 2;
  const ahh = aw / 2;
  const acy = ay - H;
  for (let dy = -ahh; dy < ahh; dy++) {
    const t = 1 - Math.abs(dy + 0.5) / ahh;
    const ww = Math.round(aw * t);
    for (let x = -ww; x < ww; x++) {
      const stripe = Math.floor((x - dy * 2 + 64) / 4) % 2 === 0;
      o.fillStyle = stripe ? tone.base : "#f4e9d2";
      o.fillRect(Math.round(ax + x), Math.round(acy + dy), 1, 1);
    }
  }
  // valance with scallops
  for (let x = 0; x < aw; x++) {
    const stripe = Math.floor(x / 4) % 2 === 0;
    const scallop = x % 4 === 3 ? 2 : 3;
    o.fillStyle = stripe ? tone.dark : "#cfc2a8";
    o.fillRect(Math.round(ax - aw + x), Math.round(acy + x / 2), 1, scallop);
    o.fillStyle = stripe ? tone.darker : "#a89b84";
    o.fillRect(Math.round(ax + x), Math.round(acy + ahh - x / 2), 1, scallop);
  }
  // ridge highlight
  o.fillStyle = tone.light;
  o.fillRect(Math.round(ax) - 1, Math.round(acy - ahh), 2, 1);
  return { under, over, ax, ay, hw, H };
}

export function buildRubble(type: AgentType): StallImg {
  const hw = 13;
  const w = hw * 2 + 8;
  const h = 34;
  const ax = w / 2;
  const ay = h - 8;
  const tone = TYPE_TONES[type];
  const [under, u] = canvas(w, h);
  diamond(u, ax, ay, hw, "#3b322b");
  diamond(u, ax, ay, hw - 3, "#463b32");
  const [over, o] = canvas(w, h);
  // tombstone
  blit(o, TOMB, TOMB_PAL, Math.round(ax - 4), ay - 14);
  // debris
  box(o, ax - 8, ay + 2, 4, 3, "#7d7368", "#5a5148", "#4a423a");
  box(o, ax + 7, ay + 1, 5, 2, "#6b4a2c", "#4e331d", "#3a2414");
  box(o, ax - 2, ay + 5, 3, 2, "#8d8579", "#6a6259", "#555048");
  // a scrap of the striped awning
  o.fillStyle = tone.base;
  o.fillRect(Math.round(ax + 3), ay - 3, 4, 2);
  o.fillStyle = "#f4e9d2";
  o.fillRect(Math.round(ax + 7), ay - 3, 2, 2);
  o.fillStyle = tone.dark;
  o.fillRect(Math.round(ax - 12), ay - 1, 3, 2);
  return { under, over, ax, ay, hw, H: 14 };
}

// ───────────────────────────── ground ─────────────────────────────

export function buildGround(Gx: number, Gy: number, toScreen: (gx: number, gy: number) => { x: number; y: number }, w: number, h: number) {
  const [c, ctx] = canvas(w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let gy = 0; gy < Gy; gy++) {
    for (let gx = 0; gx < Gx; gx++) {
      const { x, y } = toScreen(gx + 0.5, gy + 0.5);
      const plot = gx % 2 === 1 && gy % 2 === 1;
      if (plot) {
        diamond(ctx, x, y, TW / 2, "#5a4630");
        diamond(ctx, x, y, TW / 2 - 3, "#655036");
      } else {
        diamond(ctx, x, y, TW / 2, (gx + gy) % 2 ? "#4a4038" : "#453b33");
        ctx.fillStyle = "#3a312a";
        for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(x - 8 + rnd() * 16), Math.round(y - 3 + rnd() * 6), 2, 1);
        ctx.fillStyle = "#5a4f45";
        for (let k = 0; k < 2; k++) ctx.fillRect(Math.round(x - 8 + rnd() * 16), Math.round(y - 3 + rnd() * 6), 1, 1);
      }
    }
  }
  // slab edges along the two front sides of the map
  for (let gx = 0; gx < Gx; gx++) {
    const { x, y } = toScreen(gx + 0.5, Gy - 0.5);
    leftFace(ctx, x, y, TW / 2, 7, gx % 2 ? "#2c241e" : "#2f2720");
  }
  for (let gy = 0; gy < Gy; gy++) {
    const { x, y } = toScreen(Gx - 0.5, gy + 0.5);
    rightFace(ctx, x, y, TW / 2, 7, gy % 2 ? "#221c17" : "#251e19");
  }
  return c;
}
