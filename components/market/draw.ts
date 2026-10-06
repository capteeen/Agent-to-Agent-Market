// Crisp isometric primitives built from 1px fillRects (canvas paths would
// anti-alias edges, which breaks the pixel look once upscaled).

import type { AgentType } from "@/lib/types";
import { agentPalette, agentSprite, eachPixel, TOMB, TOMB_PAL, COIN, COIN_PAL, SPRITE_W, type Grid, type Palette } from "@/lib/sprites";

export const TW = 32;
export const TH = 16;

type Ctx = CanvasRenderingContext2D;
export type P = { x: number; y: number };

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
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const px = (ctx: Ctx, x: number, y: number, c: string, w = 1, h = 1) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

export const TYPE_TONES: Record<AgentType, { base: string; light: string; dark: string; darker: string }> = {
  launcher: { base: "#ff6b35", light: "#ffa06e", dark: "#b8441c", darker: "#7a2c12" },
  scout: { base: "#3aa35c", light: "#7fd99a", dark: "#237040", darker: "#164a2a" },
  shiller: { base: "#9b5cff", light: "#c9a6ff", dark: "#6a35c4", darker: "#44207f" },
};

const WOOD = { top: "#b07a48", light: "#c9915a", side: "#6b4425", dark: "#4e301a", post: "#3a2414" };
const CREAM = "#f4e9d2";
const CREAM_D = "#cfc2a8";

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

export const SPRITE_HALF = SPRITE_W / 2;

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
  /** lantern / string-light positions relative to the anchor */
  lights: P[];
}

function stripeIdx(x: number, dy: number) {
  return Math.floor((x + 2 * dy + 400) / 5) % 2 === 0;
}

function awning(o: Ctx, ax: number, acy: number, aw: number, tone: (typeof TYPE_TONES)[AgentType]) {
  const ahh = aw / 2;
  // roof: stripes parallel to the left edge, right half in shade
  for (let dy = -ahh; dy < ahh; dy++) {
    const t = 1 - Math.abs(dy + 0.5) / ahh;
    const ww = Math.round(aw * t);
    for (let x = -ww; x < ww; x++) {
      const s = stripeIdx(x, dy);
      const shade = x > 0 && dy > -ahh * 0.5;
      o.fillStyle = s ? (shade ? tone.dark : tone.base) : shade ? CREAM_D : CREAM;
      o.fillRect(Math.round(ax + x), Math.round(acy + dy), 1, 1);
    }
  }
  // valances with scallops
  for (let x = 0; x < aw; x++) {
    const lx = -aw + x; // left face column
    const s = stripeIdx(lx, x / 2);
    const scallop = x % 4 === 3 ? 2 : 3;
    o.fillStyle = s ? tone.dark : CREAM_D;
    o.fillRect(Math.round(ax + lx), Math.round(acy + x / 2), 1, scallop);
    o.fillStyle = s ? tone.darker : "#a89b84";
    o.fillRect(Math.round(ax + x), Math.round(acy + ahh - x / 2), 1, x % 4 === 3 ? 2 : 3);
  }
  // ridge highlight and a cap pixel
  px(o, ax - 1, acy - ahh, tone.light, 2, 1);
  px(o, ax - 1, acy - ahh - 1, WOOD.post, 2, 1);
}

function goods(o: Ctx, type: AgentType, cx: number, cy: number) {
  // cy = counter top centre
  if (type === "launcher") {
    // a little rocket and a coin stack
    px(o, cx - 5, cy - 7, "#1b1110", 3, 1);
    px(o, cx - 5, cy - 6, "#ff6b35", 3, 4);
    px(o, cx - 4, cy - 8, "#ffd23f", 1, 1);
    px(o, cx - 4, cy - 2, "#5bc0eb", 1, 1);
    px(o, cx + 2, cy - 4, "#c77d00", 4, 1);
    px(o, cx + 2, cy - 3, "#f5a623", 4, 1);
    px(o, cx + 2, cy - 2, "#c77d00", 4, 1);
    px(o, cx + 2, cy - 1, "#f5a623", 4, 1);
  } else if (type === "scout") {
    // a map and a telescope
    px(o, cx - 6, cy - 5, CREAM, 5, 4);
    px(o, cx - 5, cy - 4, "#3aa35c", 1, 1);
    px(o, cx - 3, cy - 3, "#e8453c", 1, 1);
    px(o, cx - 4, cy - 2, "#5bc0eb", 2, 1);
    px(o, cx + 1, cy - 2, "#1b1110", 1, 1);
    px(o, cx + 2, cy - 3, "#5a5148", 1, 1);
    px(o, cx + 3, cy - 4, "#8d8579", 1, 1);
    px(o, cx + 4, cy - 5, "#8d8579", 1, 1);
    px(o, cx + 5, cy - 6, "#5bc0eb", 1, 1);
    px(o, cx + 1, cy - 1, "#3a2414", 1, 1);
  } else {
    // posters and a stack of flyers
    px(o, cx - 6, cy - 7, "#1b1110", 5, 6);
    px(o, cx - 5, cy - 6, CREAM, 3, 4);
    px(o, cx - 4, cy - 5, "#ff5fa2", 1, 1);
    px(o, cx - 5, cy - 3, "#9b5cff", 3, 1);
    px(o, cx + 1, cy - 3, CREAM, 5, 1);
    px(o, cx + 2, cy - 2, CREAM_D, 5, 1);
    px(o, cx + 1, cy - 1, CREAM, 5, 1);
    px(o, cx + 3, cy - 3, "#ff5fa2", 1, 1);
  }
}

export function buildStall(type: AgentType, size: number): StallImg {
  const { hw, H } = STALL_SIZES[size];
  const hh = hw / 2;
  const w = hw * 2 + 12;
  const h = H + hw + 22;
  const ax = w / 2;
  const ay = h - hh - 6;
  const tone = TYPE_TONES[type];
  const lights: P[] = [];

  // ── under: shadow, raised platform, back post
  const [under, u] = canvas(w, h);
  u.globalAlpha = 0.35;
  diamond(u, ax + 2, ay + 3, hw + 1, "#000");
  u.globalAlpha = 1;
  box(u, ax, ay + 1, hw, 3, WOOD.top, WOOD.side, WOOD.dark);
  // plank lines on the platform
  u.fillStyle = WOOD.side;
  for (let dy = -hh + 2; dy < hh - 1; dy += 2) {
    const t = 1 - Math.abs(dy + 0.5) / hh;
    const ww = Math.round((hw - 1) * t);
    if (ww > 0) u.fillRect(Math.round(ax - ww), Math.round(ay - 2 + dy), ww * 2, 1);
  }
  u.fillStyle = WOOD.light;
  u.fillRect(Math.round(ax) - 1, Math.round(ay - 2 - hh + 1), 2, 1);
  // back post (at the top corner)
  px(u, ax - 1, ay - 2 - hh - H + 4, WOOD.post, 2, H - 3);
  px(u, ax, ay - 2 - hh - H + 4, WOOD.side, 1, H - 3);

  // ── over: side posts, counter, goods, awning, extras
  const [over, o] = canvas(w, h);
  // side posts at the left/right corners
  for (const sx of [ax - hw + 1, ax + hw - 3]) {
    px(o, sx, ay - 2 - H + 2, WOOD.post, 2, H - 1);
    px(o, sx + 1, ay - 2 - H + 2, WOOD.side, 1, H - 1);
  }
  // counter in front
  const cw = Math.round(hw * 0.8);
  const counterY = ay - 2 + hh * 0.45;
  box(o, ax, counterY, cw, 6, WOOD.top, WOOD.side, WOOD.dark);
  leftFace(o, ax, counterY - 6, cw, 1, tone.base);
  rightFace(o, ax, counterY - 6, cw, 1, tone.dark);
  // cloth hanging in front of the counter
  leftFace(o, ax, counterY - 4, cw, 2, tone.darker);
  rightFace(o, ax, counterY - 4, cw, 2, tone.darker);
  goods(o, type, ax, counterY - 6 - cw / 2 + 2);
  // awning
  const aw = hw + 3;
  const acy = ay - 2 - H;
  awning(o, ax, acy, aw, tone);
  // lantern on the right post
  const ly = acy + aw / 4 + 5;
  px(o, ax + hw - 2, ly - 1, WOOD.post, 1, 1);
  px(o, ax + hw - 3, ly, "#3a2400", 3, 1);
  px(o, ax + hw - 3, ly + 1, "#ffd23f", 3, 2);
  px(o, ax + hw - 3, ly + 3, "#3a2400", 3, 1);
  lights.push({ x: hw - 2, y: ly + 2 - ay });
  if (size >= 1) {
    // flag on the back post
    const fy = acy - aw / 2 - 8;
    px(o, ax - 1, fy, WOOD.post, 1, 8);
    px(o, ax, fy, tone.base, 5, 1);
    px(o, ax, fy + 1, tone.base, 4, 1);
    px(o, ax, fy + 2, tone.light, 3, 1);
    px(o, ax, fy + 3, tone.base, 2, 1);
  }
  if (size >= 2) {
    // string lights along the front valances
    for (let x = 3; x < aw; x += 4) {
      const lxl = ax - aw + x;
      const lyl = acy + x / 2 + 4;
      px(o, lxl, lyl - 1, "#3a2400", 1, 1);
      px(o, lxl, lyl, "#ffd23f", 1, 1);
      lights.push({ x: lxl - ax, y: lyl - ay });
      const lxr = ax + x;
      const lyr = acy + aw / 2 - x / 2 + 4;
      px(o, lxr, lyr - 1, "#3a2400", 1, 1);
      px(o, lxr, lyr, "#ffd23f", 1, 1);
      lights.push({ x: lxr - ax, y: lyr - ay });
    }
  }
  return { under, over, ax, ay, hw, H, lights };
}

export function buildRubble(type: AgentType): StallImg {
  const hw = 13;
  const w = hw * 2 + 8;
  const h = 36;
  const ax = w / 2;
  const ay = h - 8;
  const tone = TYPE_TONES[type];
  const [under, u] = canvas(w, h);
  u.globalAlpha = 0.3;
  diamond(u, ax + 1, ay + 2, hw, "#000");
  u.globalAlpha = 1;
  diamond(u, ax, ay, hw, "#3b322b");
  diamond(u, ax, ay, hw - 3, "#463b32");
  // ash
  u.fillStyle = "#2a241f";
  for (let i = 0; i < 10; i++) u.fillRect(Math.round(ax - 9 + ((i * 7) % 18)), Math.round(ay - 4 + ((i * 5) % 8)), 2, 1);
  const [over, o] = canvas(w, h);
  blit(o, TOMB, TOMB_PAL, Math.round(ax - 4), ay - 15);
  // charred beams
  box(o, ax - 8, ay + 2, 4, 3, "#4a423a", "#2e2823", "#241f1a");
  px(o, ax - 12, ay - 3, "#2e2823", 9, 2);
  px(o, ax + 3, ay + 1, "#3a2414", 7, 2);
  box(o, ax - 2, ay + 5, 3, 2, "#8d8579", "#6a6259", "#555048");
  // a scrap of the striped awning
  px(o, ax + 4, ay - 4, tone.base, 3, 2);
  px(o, ax + 7, ay - 4, CREAM, 2, 2);
  px(o, ax + 9, ay - 3, tone.dark, 2, 1);
  return { under, over, ax, ay, hw, H: 14, lights: [] };
}

// ───────────────────────────── ground ─────────────────────────────

export const GROUND = {
  cobble: "#4f4740",
  cobbleL: "#5f564d",
  cobbleD: "#3f3831",
  dirt: "#5a4630",
  dirtL: "#6a5438",
  dirtD: "#4a3824",
  grass: "#3f5a2e",
  grassL: "#4f6e38",
  grassD: "#2f4522",
  cliff: "#4a3524",
  cliffD: "#30211a",
  rock: "#3a2a1c",
};

export type CellKind = "plot" | "path" | "garden";

export function buildGround(
  Gx: number,
  Gy: number,
  kind: (gx: number, gy: number) => CellKind,
  toScreen: (gx: number, gy: number) => P,
  w: number,
  h: number,
) {
  const [c, ctx] = canvas(w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let gy = 0; gy < Gy; gy++) {
    for (let gx = 0; gx < Gx; gx++) {
      const { x, y } = toScreen(gx + 0.5, gy + 0.5);
      const k = kind(gx, gy);
      if (k === "plot") {
        diamond(ctx, x, y, TW / 2, GROUND.dirtD);
        diamond(ctx, x, y, TW / 2 - 2, GROUND.dirt);
        ctx.fillStyle = GROUND.dirtL;
        for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(x - 8 + rnd() * 16), Math.round(y - 3 + rnd() * 6), 2, 1);
      } else if (k === "path") {
        diamond(ctx, x, y, TW / 2, GROUND.cobbleD);
        diamond(ctx, x, y, TW / 2 - 1, GROUND.cobble);
        // cobbles: a loose grid of lighter stones with dark joints
        for (let i = 0; i < 7; i++) {
          const sx = Math.round(x - 10 + rnd() * 20);
          const sy = Math.round(y - 4 + rnd() * 8);
          ctx.fillStyle = rnd() < 0.5 ? GROUND.cobbleL : GROUND.cobble;
          ctx.fillRect(sx, sy, 3, 2);
          ctx.fillStyle = GROUND.cobbleD;
          ctx.fillRect(sx + 3, sy + 1, 1, 1);
        }
      } else {
        diamond(ctx, x, y, TW / 2, GROUND.grassD);
        diamond(ctx, x, y, TW / 2 - 1, GROUND.grass);
        ctx.fillStyle = GROUND.grassL;
        for (let i = 0; i < 5; i++) {
          const sx = Math.round(x - 9 + rnd() * 18);
          const sy = Math.round(y - 3 + rnd() * 6);
          ctx.fillRect(sx, sy, 1, 1);
          ctx.fillRect(sx + 1, sy - 1, 1, 1);
        }
        if (rnd() < 0.15) {
          ctx.fillStyle = rnd() < 0.5 ? "#ffd23f" : "#ff5fa2";
          ctx.fillRect(Math.round(x - 4 + rnd() * 8), Math.round(y - 2 + rnd() * 4), 1, 1);
        }
      }
    }
  }
  // cliff along the two front sides: grass lip, dirt, rock
  const CLIFF = 11;
  for (let gx = 0; gx < Gx; gx++) {
    const { x, y } = toScreen(gx + 0.5, Gy - 0.5);
    leftFace(ctx, x, y, TW / 2, CLIFF, GROUND.cliff);
    leftFace(ctx, x, y, TW / 2, 2, GROUND.grassD);
    leftFace(ctx, x, y + 7, TW / 2, 4, GROUND.rock);
    ctx.fillStyle = GROUND.cliffD;
    for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(x - 14 + rnd() * 12), Math.round(y + 3 + rnd() * 6), 2, 1);
  }
  for (let gy = 0; gy < Gy; gy++) {
    const { x, y } = toScreen(Gx - 0.5, gy + 0.5);
    rightFace(ctx, x, y, TW / 2, CLIFF, GROUND.cliffD);
    rightFace(ctx, x, y, TW / 2, 2, GROUND.grassD);
    rightFace(ctx, x, y + 7, TW / 2, 4, "#2a1d14");
  }
  return c;
}

// ───────────────────────────── props ─────────────────────────────

export interface PropImg {
  img: HTMLCanvasElement;
  ax: number;
  ay: number;
  light?: P;
}

export function buildProps(): Record<string, PropImg> {
  const out: Record<string, PropImg> = {};

  // tree: round canopy on a trunk
  {
    const [c, o] = canvas(15, 22);
    px(o, 6, 14, "#3a2414", 3, 6);
    px(o, 7, 14, "#4e301a", 1, 6);
    const canopy = ["....kkkkkk.....", "..kkGGGGGGkk...", ".kGGLLGGGGGGk..", "kGLLGGGGGGGGGk.", "kGGGGGGGGDGGGk.", "kGGGGGGDDGGGGk.", ".kGGGGGDDGGGk..", "..kkGGGGGGkk...", "....kkkkkk....."];
    blit(o, canopy, { k: "#1b2a14", G: "#3f6e35", L: "#6fa84f", D: "#2f5226" }, 0, 3);
    o.globalAlpha = 0.3;
    diamond(o, 8, 20, 6, "#000");
    out.tree = { img: c, ax: 8, ay: 19 };
  }
  // bush
  {
    const [c, o] = canvas(11, 8);
    blit(o, ["...kkkkk...", ".kkGGLGGkk.", "kGGGGGGGGGk", "kGLGGGGDGGk", ".kGGGDDGGk.", "..kkkkkkk.."], { k: "#1b2a14", G: "#3f6e35", L: "#6fa84f", D: "#2f5226" }, 0, 1);
    out.bush = { img: c, ax: 5, ay: 7 };
  }
  // barrel
  {
    const [c, o] = canvas(8, 10);
    blit(o, [".kkkkkk.", "kBBBBBBk", "kbbbbbbk", "kBBBBBBk", "kBBBBBBk", "kbbbbbbk", "kBBBBBBk", ".kkkkkk."], { k: "#2a1a0e", B: "#8a5a30", b: "#4e301a" }, 0, 1);
    out.barrel = { img: c, ax: 4, ay: 9 };
  }
  // crate
  {
    const [c, o] = canvas(10, 10);
    box(o, 5, 9, 4, 5, "#c9915a", "#8a5a30", "#6b4425");
    px(o, 2, 6, "#4e301a", 1, 2);
    px(o, 7, 6, "#4e301a", 1, 2);
    out.crate = { img: c, ax: 5, ay: 9 };
  }
  // lamp post
  {
    const [c, o] = canvas(7, 20);
    px(o, 3, 6, "#2a2420", 1, 13);
    px(o, 1, 18, "#2a2420", 5, 2);
    px(o, 2, 1, "#2a2420", 3, 1);
    px(o, 1, 2, "#2a2420", 5, 4);
    px(o, 2, 3, "#ffd23f", 3, 2);
    px(o, 3, 0, "#2a2420", 1, 1);
    out.lamp = { img: c, ax: 3, ay: 19, light: { x: 0, y: -15 } };
  }
  // signpost
  {
    const [c, o] = canvas(12, 16);
    px(o, 5, 4, "#3a2414", 2, 12);
    px(o, 1, 3, "#2a1a0e", 10, 5);
    px(o, 2, 4, "#b07a48", 8, 3);
    px(o, 3, 5, "#f5a623", 2, 1);
    px(o, 6, 5, "#f5a623", 3, 1);
    out.sign = { img: c, ax: 6, ay: 15 };
  }
  // fountain-ish well for the plaza centre
  {
    const [c, o] = canvas(24, 20);
    o.globalAlpha = 0.3;
    diamond(o, 12, 16, 11, "#000");
    o.globalAlpha = 1;
    box(o, 12, 16, 10, 4, "#6f685d", "#4a423a", "#3a332c");
    diamond(o, 12, 12, 7, "#3a6fa0");
    diamond(o, 12, 12, 4, "#5bc0eb");
    px(o, 11, 4, "#4a423a", 2, 8);
    px(o, 10, 3, "#6f685d", 4, 2);
    px(o, 11, 2, "#5bc0eb", 2, 1);
    out.well = { img: c, ax: 12, ay: 16 };
  }
  return out;
}

// ───────────────────────────── sky ─────────────────────────────

export function buildCloud(seed: number) {
  const [c, o] = canvas(26, 9);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 5; i++) {
    const w = 6 + Math.floor(rnd() * 8);
    const x = Math.floor(rnd() * (26 - w));
    const y = 2 + Math.floor(rnd() * 4);
    px(o, x, y, "#f4f4f2", w, 3);
    px(o, x + 1, y - 1, "#f4f4f2", w - 2, 1);
    px(o, x, y + 3, "#cfd3d8", w, 1);
  }
  return c;
}
