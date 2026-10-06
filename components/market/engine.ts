// The isometric market renderer. Framework-free: MarketCanvas.tsx mounts it
// and it reads the zustand store directly every frame (no React re-renders).

import { useMarket, useUi } from "@/lib/store";
import { RUBBLE_MS, type Agent, type AgentType, type MarketEvent } from "@/lib/types";
import { earnings7d } from "@/lib/world";
import { mulberry32 } from "@/lib/rng";
import { drawText, labelCanvas, textWidth } from "./font";
import {
  TW,
  TH,
  SPRITE_HALF,
  buildCloud,
  buildCoin,
  buildGround,
  buildProps,
  buildRubble,
  buildSprites,
  buildStall,
  diamond,
  type CellKind,
  type PropImg,
  type SpriteSet,
  type StallImg,
} from "./draw";
import { SPRITE_H } from "@/lib/sprites";

type P = { x: number; y: number };

export type Selection = { agent: string } | { job: string };

interface Walker {
  type: AgentType;
  jobId?: string;
  path: P[]; // tile coords
  seg: number;
  t: number; // progress along current segment in tiles
  pos: P;
  flip: boolean;
  speed: number;
  onArrive?: () => void;
  ambient?: boolean;
  pause: number;
  bubble?: number; // ms remaining showing "!"
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color?: string;
  kind: "coin" | "dust" | "spark" | "firefly";
  text?: string;
}

export interface EngineOpts {
  cols: number;
  rows: number;
  onSelect: (sel: Selection | null) => void;
  onHover: (id: string | null) => void;
}

const PAD = 12;
const HEAD = 56;

export class MarketEngine {
  private ctx: CanvasRenderingContext2D;
  private Gx: number;
  private Gy: number;
  readonly mapW: number;
  readonly mapH: number;
  private ground: HTMLCanvasElement;
  private sprites = buildSprites();
  private coin = buildCoin();
  private stallCache = new Map<string, StallImg>();
  private labelCache = new Map<string, HTMLCanvasElement>();
  private slots: P[];
  private slotOf = new Map<string, number>();
  private sizeOf = new Map<string, number>();
  private walkers: Walker[] = [];
  private particles: Particle[] = [];
  private glow = new Map<string, number>(); // agentId → ms left
  private born = new Map<string, number>(); // agentId → ms since spawn anim start
  private collapse = new Map<string, number>();
  private lastEventId: string | null = null;
  private lastSize = 0;
  private raf = 0;
  private last = 0;
  private shake = 0;
  private cam: P = { x: 0, y: 0 };
  private camTarget: P | null = null;
  private userPanAt = 0;
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  private scale = 2;
  private stars: P[] = [];
  private clouds: { img: HTMLCanvasElement; x: number; y: number; v: number }[] = [];
  private propImgs = buildProps();
  /** static scenery, depth-sorted with everything else */
  private props: { p: PropImg; gx: number; gy: number }[] = [];
  private fireflyAt = 0;
  filter: AgentType | "all" = "all";
  selected: string | null = null;
  hovered: string | null = null;
  /** for tests/debug: force the hour of day (0-24) */
  forceHour: number | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: EngineOpts,
  ) {
    this.ctx = canvas.getContext("2d")!;
    // plots on odd inner cells, cobbled paths between them, a garden ring around it all
    this.Gx = opts.cols * 2 + 3;
    this.Gy = opts.rows * 2 + 3;
    this.mapW = (this.Gx + this.Gy) * (TW / 2) + PAD * 2;
    this.mapH = (this.Gx + this.Gy) * (TH / 2) + HEAD + 20;
    const kind = (gx: number, gy: number): CellKind => {
      if (gx === 0 || gy === 0 || gx === this.Gx - 1 || gy === this.Gy - 1) return "garden";
      return (gx - 1) % 2 === 1 && (gy - 1) % 2 === 1 ? "plot" : "path";
    };
    this.ground = buildGround(this.Gx, this.Gy, kind, (gx, gy) => this.toScreen(gx, gy), this.mapW, this.mapH);
    const r = mulberry32(42);
    this.slots = [];
    const mid = { x: (opts.cols - 1) / 2, y: (opts.rows - 1) / 2 };
    const plaza = opts.cols % 2 === 1 && opts.rows % 2 === 1;
    for (let j = 0; j < opts.rows; j++)
      for (let i = 0; i < opts.cols; i++) {
        if (plaza && i === mid.x && j === mid.y) continue; // the well sits here
        this.slots.push({ x: i, y: j });
      }
    // fill from the middle out so a sparse market still looks like a plaza
    this.slots.sort((a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y) + (r() - 0.5) * 1.2);
    if (plaza) this.props.push({ p: this.propImgs.well, gx: mid.x * 2 + 2.5, gy: mid.y * 2 + 2.5 });
    // scenery on the garden ring; lamp posts at the corners
    for (let gy = 0; gy < this.Gy; gy++)
      for (let gx = 0; gx < this.Gx; gx++) {
        if (kind(gx, gy) !== "garden") continue;
        const corner = (gx === 0 || gx === this.Gx - 1) && (gy === 0 || gy === this.Gy - 1);
        const roll = r();
        const name = corner ? "lamp" : roll < 0.3 ? "tree" : roll < 0.5 ? "bush" : roll < 0.58 ? "barrel" : roll < 0.64 ? "crate" : roll < 0.68 ? "sign" : "";
        if (!name) continue;
        this.props.push({ p: this.propImgs[name], gx: gx + 0.3 + r() * 0.4, gy: gy + 0.3 + r() * 0.4 });
      }
    for (let i = 0; i < 60; i++) this.stars.push({ x: r(), y: r() });
    for (let i = 0; i < 4; i++) this.clouds.push({ img: buildCloud(11 + i * 7), x: r() * 1.2, y: 0.02 + r() * 0.12, v: 0.004 + r() * 0.004 });
    for (let i = 0; i < 5; i++) this.spawnAmbient();
    this.bindPointer();
  }

  toScreen(gx: number, gy: number): P {
    return { x: (gx - gy) * (TW / 2) + this.Gy * (TW / 2) + PAD, y: (gx + gy) * (TH / 2) + HEAD };
  }

  private slotCenter(slot: number): P {
    const s = this.slots[slot];
    return { x: s.x * 2 + 2.5, y: s.y * 2 + 2.5 };
  }

  // ─────────────────────────── lifecycle ───────────────────────────

  resize(cssW: number, cssH: number) {
    const fit = Math.min(cssW / this.mapW, cssH / this.mapH);
    this.scale = Math.max(2, Math.min(4, Math.floor(fit)));
    if (cssW < 640) this.scale = 2;
    this.canvas.width = Math.max(1, Math.floor(cssW / this.scale));
    this.canvas.height = Math.max(1, Math.floor(cssH / this.scale));
    this.ctx.imageSmoothingEnabled = false;
    this.clampCam(true);
  }

  start() {
    const loop = (t: number) => {
      const dt = Math.min(50, this.last ? t - this.last : 16);
      this.last = t;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.unbind?.();
  }

  // ─────────────────────────── state sync ───────────────────────────

  private visibleAgents(now: number): Agent[] {
    const { agents, order } = useMarket.getState();
    const out: Agent[] = [];
    for (const id of order) {
      const a = agents[id];
      if (!a) continue;
      if (a.diedAt && now - a.diedAt > RUBBLE_MS) continue;
      out.push(a);
    }
    return out;
  }

  private syncSlots(list: Agent[]) {
    const ids = new Set(list.map((a) => a.id));
    for (const id of [...this.slotOf.keys()]) if (!ids.has(id)) this.slotOf.delete(id);
    const used = new Set(this.slotOf.values());
    let free = 0;
    for (const a of list) {
      if (this.slotOf.has(a.id)) continue;
      while (free < this.slots.length && used.has(free)) free++;
      if (free >= this.slots.length) break;
      this.slotOf.set(a.id, free);
      used.add(free);
      if (this.lastEventId !== null) this.born.set(a.id, 0);
    }
    if (list.length !== this.lastSize || Math.random() < 0.02) {
      this.lastSize = list.length;
      const { history } = useMarket.getState();
      const ranked = list
        .filter((a) => !a.diedAt)
        .map((a) => ({ id: a.id, e: earnings7d(history[a.id]) }))
        .sort((a, b) => b.e - a.e);
      ranked.forEach((r, i) => {
        const q = i / Math.max(1, ranked.length);
        this.sizeOf.set(r.id, q < 0.2 ? 2 : q < 0.6 ? 1 : 0);
      });
    }
  }

  private processEvents() {
    const { events } = useMarket.getState();
    if (!events.length) return;
    if (this.lastEventId === null) {
      this.lastEventId = events[0].id;
      return;
    }
    const fresh: MarketEvent[] = [];
    for (const e of events) {
      if (e.id === this.lastEventId) break;
      fresh.push(e);
      if (fresh.length > 12) break;
    }
    if (!fresh.length) return;
    this.lastEventId = events[0].id;
    for (const e of fresh.reverse()) this.onEvent(e);
  }

  private stallTop(id: string): P | null {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return null;
    const c = this.slotCenter(slot);
    const s = this.toScreen(c.x, c.y);
    return { x: s.x, y: s.y - 30 };
  }

  private onEvent(e: MarketEvent) {
    const { agents } = useMarket.getState();
    if (e.kind === "hire") {
      const [hirerId, workerId] = e.agentIds;
      const hs = this.slotOf.get(hirerId);
      const ws = this.slotOf.get(workerId);
      const hirer = agents[hirerId];
      if (hs === undefined || ws === undefined || !hirer) return;
      const h = this.slotCenter(hs);
      const w = this.slotCenter(ws);
      const path = [
        { x: h.x, y: h.y + 1 },
        { x: w.x + 1, y: h.y + 1 },
        { x: w.x + 1, y: w.y + 1 },
        { x: w.x, y: w.y + 1 },
      ];
      const walker: Walker = {
        type: hirer.type,
        jobId: e.jobId,
        path,
        seg: 0,
        t: 0,
        pos: { ...path[0] },
        flip: false,
        speed: 3.2,
        pause: 0,
        onArrive: () => {
          const top = this.stallTop(workerId);
          if (top) this.coinPop(top.x, top.y, "+" + e.amount.toFixed(3));
          this.glow.set(workerId, 1600);
          walker.bubble = 700;
          walker.pause = 700;
          walker.path = [...path].reverse();
          walker.seg = 0;
          walker.t = 0;
          walker.onArrive = undefined;
          walker.ambient = true; // vanish when back home
        },
      };
      this.walkers.push(walker);
      const mid = this.toScreen((h.x + w.x) / 2, (h.y + w.y) / 2);
      this.camTarget = mid;
    } else if (e.kind === "job_done") {
      const top = this.stallTop(e.agentIds[0]);
      if (top) this.sparks(top.x, top.y + 6, "#f5a623", 8);
      this.glow.set(e.agentIds[0], 1200);
    } else if (e.kind === "fee") {
      const top = this.stallTop(e.agentIds[0]);
      if (top) this.coinPop(top.x, top.y, "+" + e.amount.toFixed(3), true);
    } else if (e.kind === "death") {
      const id = e.agentIds[0];
      this.collapse.set(id, 0);
      const top = this.stallTop(id);
      if (top) {
        for (let i = 0; i < 26; i++) {
          this.particles.push({
            x: top.x + (Math.random() - 0.5) * 24,
            y: top.y + 18 + Math.random() * 10,
            vx: (Math.random() - 0.5) * 40,
            vy: -Math.random() * 50,
            life: 0,
            max: 900 + Math.random() * 500,
            kind: "dust",
            color: Math.random() < 0.5 ? "#8d8579" : "#6b4a2c",
          });
        }
        this.shake = 350;
        this.camTarget = top;
      }
    } else if (e.kind === "launch") {
      const top = this.stallTop(e.agentIds[0]);
      if (top) this.sparks(top.x, top.y, "#ffd23f", 16);
    }
  }

  private coinPop(x: number, y: number, text: string, small = false) {
    this.particles.push({ x, y, vx: 0, vy: -16, life: 0, max: small ? 1000 : 1500, kind: "coin", text: small ? undefined : text });
  }

  private sparks(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.particles.push({ x, y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 20 - 10, life: 0, max: 700, kind: "spark", color });
    }
  }

  private spawnAmbient() {
    const types: AgentType[] = ["launcher", "scout", "shiller"];
    const rand = (n: number) => Math.floor(Math.random() * n) * 2 + 1.5;
    const start = { x: rand(this.opts.cols + 1), y: rand(this.opts.rows + 1) };
    const walker: Walker = {
      type: types[Math.floor(Math.random() * 3)],
      path: [start],
      seg: 0,
      t: 0,
      pos: { ...start },
      flip: false,
      speed: 1.6 + Math.random() * 0.8,
      pause: Math.random() * 2000,
      ambient: true,
    };
    this.retarget(walker);
    walker.ambient = true;
    (walker as Walker & { npc: boolean }).npc = true;
    this.walkers.push(walker);
  }

  private retarget(w: Walker) {
    const rand = (n: number) => Math.floor(Math.random() * n) * 2 + 1.5;
    const to = { x: rand(this.opts.cols + 1), y: rand(this.opts.rows + 1) };
    w.path = [{ ...w.pos }, { x: to.x, y: w.pos.y }, to];
    w.seg = 0;
    w.t = 0;
  }

  // ───────────────────────────── update ─────────────────────────────

  private update(dt: number) {
    const now = Date.now();
    const list = this.visibleAgents(now);
    this.syncSlots(list);
    this.processEvents();

    for (const [k, v] of this.glow) v - dt <= 0 ? this.glow.delete(k) : this.glow.set(k, v - dt);
    for (const [k, v] of this.born) v + dt > 700 ? this.born.delete(k) : this.born.set(k, v + dt);
    for (const [k, v] of this.collapse) v + dt > 900 ? this.collapse.delete(k) : this.collapse.set(k, v + dt);
    if (this.shake > 0) this.shake -= dt;

    const keep: Walker[] = [];
    for (const w of this.walkers) {
      if (w.bubble) w.bubble = Math.max(0, w.bubble - dt);
      if (w.pause > 0) {
        w.pause -= dt;
        keep.push(w);
        continue;
      }
      const a = w.path[w.seg];
      const b = w.path[w.seg + 1];
      if (!b) {
        if (w.onArrive) {
          w.onArrive();
          keep.push(w);
        } else if ((w as Walker & { npc?: boolean }).npc) {
          this.retarget(w);
          w.pause = 500 + Math.random() * 3000;
          keep.push(w);
        }
        continue;
      }
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 0.0001;
      w.t += (w.speed * dt) / 1000;
      if (w.t >= len) {
        w.seg++;
        w.t = 0;
        w.pos = { ...b };
      } else {
        w.pos = { x: a.x + ((b.x - a.x) * w.t) / len, y: a.y + ((b.y - a.y) * w.t) / len };
      }
      const sdx = (b.x - a.x) - (b.y - a.y); // screen-x direction
      if (sdx !== 0) w.flip = sdx < 0;
      keep.push(w);
    }
    this.walkers = keep;

    for (const c of this.clouds) {
      c.x += (c.v * dt) / 1000;
      if (c.x > 1.1) c.x = -0.2;
    }
    // fireflies drift over the garden at night
    const dark = this.dayState().dark;
    if (dark > 0.5 && now > this.fireflyAt) {
      this.fireflyAt = now + 400;
      const edge = Math.random() < 0.5;
      const gx = edge ? Math.random() * this.Gx : Math.random() < 0.5 ? 0.5 : this.Gx - 0.5;
      const gy = edge ? (Math.random() < 0.5 ? 0.5 : this.Gy - 0.5) : Math.random() * this.Gy;
      const s = this.toScreen(gx, gy);
      this.particles.push({ x: s.x, y: s.y - 6 - Math.random() * 10, vx: (Math.random() - 0.5) * 8, vy: -2 - Math.random() * 4, life: 0, max: 2500 + Math.random() * 2000, kind: "firefly", color: "#d8ff5a" });
    }
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      if (p.kind === "dust") p.vy += (120 * dt) / 1000;
      return p.life < p.max;
    });

    // camera: follow the action unless the user panned recently or turned it off
    if (this.camTarget && useUi.getState().follow && now - this.userPanAt > 4000) {
      const vw = this.canvas.width;
      const vh = this.canvas.height;
      const tx = this.camTarget.x - vw / 2;
      const ty = this.camTarget.y - vh / 2;
      this.cam.x += (tx - this.cam.x) * Math.min(1, dt / 900);
      this.cam.y += (ty - this.cam.y) * Math.min(1, dt / 900);
      this.clampCam();
    }
  }

  private clampCam(center = false) {
    const vw = this.canvas.width;
    const vh = this.canvas.height;
    if (this.mapW <= vw) this.cam.x = (this.mapW - vw) / 2;
    else {
      if (center) this.cam.x = (this.mapW - vw) / 2;
      this.cam.x = Math.max(0, Math.min(this.mapW - vw, this.cam.x));
    }
    if (this.mapH <= vh) this.cam.y = (this.mapH - vh) / 2;
    else {
      if (center) this.cam.y = (this.mapH - vh) / 2;
      this.cam.y = Math.max(0, Math.min(this.mapH - vh, this.cam.y));
    }
  }

  // ───────────────────────────── drawing ─────────────────────────────

  private stall(type: AgentType, size: number) {
    const k = `${type}-${size}`;
    let s = this.stallCache.get(k);
    if (!s) {
      s = buildStall(type, size);
      this.stallCache.set(k, s);
    }
    return s;
  }

  private rubble(type: AgentType) {
    const k = `rubble-${type}`;
    let s = this.stallCache.get(k);
    if (!s) {
      s = buildRubble(type);
      this.stallCache.set(k, s);
    }
    return s;
  }

  private label(a: Agent) {
    const k = `${a.id}|${a.ticker}|${!!a.diedAt}`;
    let c = this.labelCache.get(k);
    if (!c) {
      c = labelCanvas(a.diedAt ? "RIP" : "$" + a.ticker.slice(0, 7), a.diedAt ? "#8d8579" : "#f5a623");
      this.labelCache.set(k, c);
    }
    return c;
  }

  private dayState() {
    const d = new Date();
    // light theme shows the market at noon; dark theme follows real UTC
    const h = this.forceHour ?? (useUi.getState().night ? d.getUTCHours() + d.getUTCMinutes() / 60 : 12);
    const light = 0.5 - 0.5 * Math.cos((2 * Math.PI * h) / 24); // 0 midnight → 1 noon
    const dark = Math.max(0, Math.min(1, (0.6 - light) / 0.5));
    const dusk = Math.max(0, 1 - Math.min(Math.abs(h - 6.5), Math.abs(h - 18.5)) / 1.6);
    return { h, light, dark, dusk };
  }

  private draw() {
    const ctx = this.ctx;
    const vw = this.canvas.width;
    const vh = this.canvas.height;
    const now = Date.now();
    const day = this.dayState();
    const t = performance.now();

    // sky
    const sky = mix("#5a4634", "#0e0c16", day.dark);
    ctx.fillStyle = mix(sky, "#7a3b22", day.dusk * 0.6);
    ctx.fillRect(0, 0, vw, vh);
    if (day.dark > 0.3) {
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        if ((Math.floor(t / 400) + i) % 7 === 0) continue;
        ctx.fillStyle = `rgba(244,244,242,${(day.dark - 0.3) * 1.2})`;
        ctx.fillRect(Math.floor(s.x * vw), Math.floor(s.y * vh), 1, 1);
      }
    }
    // a stepped glow near the horizon (pixel gradient)
    ctx.fillStyle = mix(mix("#8a6a48", "#1a1830", day.dark), "#a0502a", day.dusk * 0.5);
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = 0.06 * (i + 1);
      ctx.fillRect(0, Math.round(vh * (0.2 + i * 0.03)), vw, Math.round(vh * 0.03));
    }
    ctx.globalAlpha = 1;
    // sun / moon arcs across the top-left → top-right
    const arcT = ((day.h + 18) % 12) / 12;
    const isSun = day.h >= 6 && day.h < 18;
    const bx = Math.round(8 + arcT * (vw - 24));
    const by = Math.round(10 + Math.sin(arcT * Math.PI) * -6 + 6);
    ctx.fillStyle = isSun ? "#ffd23f" : "#f4ecd2";
    ctx.fillRect(bx + 1, by, 6, 8);
    ctx.fillRect(bx, by + 1, 8, 6);
    if (!isSun) {
      ctx.fillStyle = mix(sky, "#7a3b22", day.dusk * 0.6);
      ctx.fillRect(bx + 3, by, 5, 6);
    }
    if (day.dark < 0.9) {
      ctx.globalAlpha = (1 - day.dark) * 0.9;
      for (const c of this.clouds) ctx.drawImage(c.img, Math.round(c.x * vw), Math.round(c.y * vh));
      ctx.globalAlpha = 1;
    }

    const shakeX = this.shake > 0 ? Math.round((Math.random() - 0.5) * 3) : 0;
    const ox = -Math.round(this.cam.x) + shakeX;
    const oy = -Math.round(this.cam.y);
    ctx.drawImage(this.ground, ox, oy);

    // ── entities, depth sorted
    type Ent = { y: number; draw: () => void };
    const ents: Ent[] = [];
    const list = this.visibleAgents(now);
    const lights: P[] = [];

    for (const a of list) {
      const slot = this.slotOf.get(a.id);
      if (slot === undefined) continue;
      const c = this.slotCenter(slot);
      const s = this.toScreen(c.x, c.y);
      const sx = s.x + ox;
      const sy = s.y + oy;
      const dim = this.filter !== "all" && a.type !== this.filter;
      const collapsing = this.collapse.get(a.id);
      const dead = !!a.diedAt && collapsing === undefined;
      ents.push({
        y: s.y,
        draw: () => {
          ctx.globalAlpha = dim ? 0.3 : 1;
          if (dead) {
            const r = this.rubble(a.type);
            ctx.drawImage(r.under, Math.round(sx - r.ax), Math.round(sy - r.ay));
            ctx.drawImage(r.over, Math.round(sx - r.ax), Math.round(sy - r.ay));
          } else {
            const size = this.sizeOf.get(a.id) ?? 0;
            const st = this.stall(a.type, size);
            let lift = 0;
            const b = this.born.get(a.id);
            if (b !== undefined) lift = Math.round((1 - b / 700) * 24);
            let sink = 0;
            if (collapsing !== undefined) sink = Math.round((collapsing / 900) * st.H);
            const x0 = Math.round(sx - st.ax);
            const y0 = Math.round(sy - st.ay) - lift + sink;
            const g = this.glow.get(a.id);
            if (g) {
              ctx.globalAlpha = (dim ? 0.3 : 1) * (0.35 + 0.25 * Math.sin(t / 80));
              diamond(ctx, sx, sy, st.hw + 5, "#f5a623");
              ctx.globalAlpha = dim ? 0.3 : 1;
            }
            if (this.selected === a.id || this.hovered === a.id) {
              const on = this.selected === a.id ? Math.floor(t / 250) % 2 === 0 : true;
              if (on) diamond(ctx, sx, sy, st.hw + 4, "#f4f4f2");
            }
            ctx.save();
            if (sink) {
              ctx.beginPath();
              ctx.rect(x0 - 4, 0, st.under.width + 8, Math.round(sy + st.hw));
              ctx.clip();
            }
            ctx.drawImage(st.under, x0, y0);
            // shopkeeper peeking over the counter
            const spr = this.sprites[a.type].frames[Math.floor((t + slot * 137) / 600) % 4 === 0 ? 2 : 0];
            const bob = Math.floor((t + slot * 211) / 500) % 2;
            ctx.drawImage(spr, Math.round(sx - SPRITE_HALF), Math.round(y0 + st.ay - st.hw / 2 - SPRITE_H + 2 - bob));
            ctx.drawImage(st.over, x0, y0);
            ctx.restore();
            if (g) {
              ctx.globalAlpha = 0.5 * (g / 1600);
              ctx.globalCompositeOperation = "lighter";
              diamond(ctx, sx, y0 + st.ay - st.H, st.hw + 3, "#f5a623");
              ctx.globalCompositeOperation = "source-over";
            }
            for (const l of st.lights) lights.push({ x: sx + l.x, y: y0 + st.ay + l.y });
          }
          // labels for the bigger stalls, rubble, and whatever is hovered / busy
          const size = this.sizeOf.get(a.id) ?? 0;
          const big = vw >= 560;
          const showLabel = dead || size >= 2 || (big && size >= 1) || this.hovered === a.id || this.selected === a.id || this.glow.has(a.id);
          if (!showLabel) return;
          ctx.globalAlpha = dim ? 0.3 : 1;
          const lbl = this.label(a);
          const ly = dead ? sy - 27 : sy - (this.stall(a.type, size).H + 22 + (size >= 1 ? 8 : 0));
          ctx.drawImage(lbl, Math.round(sx - lbl.width / 2), Math.round(ly));
          ctx.globalAlpha = 1;
        },
      });
    }

    for (const pr of this.props) {
      const s = this.toScreen(pr.gx, pr.gy);
      const sx = Math.round(s.x + ox);
      const sy = Math.round(s.y + oy);
      if (pr.p.light) lights.push({ x: sx + pr.p.light.x, y: sy + pr.p.light.y });
      ents.push({ y: s.y - 0.1, draw: () => ctx.drawImage(pr.p.img, sx - pr.p.ax, sy - pr.p.ay) });
    }

    for (const w of this.walkers) {
      const s = this.toScreen(w.pos.x, w.pos.y);
      const sx = Math.round(s.x + ox);
      const sy = Math.round(s.y + oy);
      const moving = w.pause <= 0 && w.seg < w.path.length - 1;
      const frame = moving ? Math.floor(t / 140) % 2 : 0;
      const spr = this.sprites[w.type].frames[frame + (w.flip ? 2 : 0)];
      const dim = this.filter !== "all" && w.type !== this.filter;
      ents.push({
        y: s.y,
        draw: () => {
          ctx.globalAlpha = dim ? 0.3 : 1;
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(sx - 5, sy - 1, 10, 2);
          ctx.fillRect(sx - 3, sy - 2, 6, 1);
          ctx.drawImage(spr, sx - SPRITE_HALF, sy - SPRITE_H + 1 - (moving ? frame : 0));
          if (w.bubble) {
            ctx.fillStyle = "#1b1815";
            ctx.fillRect(sx - 4, sy - 30, 9, 10);
            ctx.fillStyle = "#f4f4f2";
            ctx.fillRect(sx - 3, sy - 29, 7, 8);
            ctx.fillRect(sx - 1, sy - 21, 2, 2);
            drawText(ctx, "$", sx - 1, sy - 28, "#1b1815");
          }
          ctx.globalAlpha = 1;
        },
      });
    }
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();
    ctx.globalAlpha = 1;

    // particles
    for (const p of this.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      const px = Math.round(p.x + ox);
      const py = Math.round(p.y + oy);
      if (p.kind === "coin") {
        const spin = [7, 5, 2, 5][Math.floor(p.life / 90) % 4];
        ctx.drawImage(this.coin, px - Math.floor(spin / 2), py - 3, spin, 7);
        if (p.text) {
          const tw = textWidth(p.text);
          ctx.fillStyle = "#1b1815";
          ctx.fillRect(px - tw / 2 - 1, py + 5, tw + 2, 7);
          drawText(ctx, p.text, px - tw / 2, py + 6, "#ffd23f");
        }
      } else if (p.kind === "firefly") {
        const on = Math.sin(p.life / 180 + p.x) > -0.2;
        if (on) {
          ctx.fillStyle = p.color ?? "#fff";
          ctx.fillRect(px, py, 1, 1);
          ctx.globalAlpha *= 0.3;
          ctx.fillRect(px - 1, py - 1, 3, 3);
        }
      } else {
        ctx.fillStyle = p.color ?? "#fff";
        ctx.fillRect(px, py, p.kind === "dust" ? 2 : 1, p.kind === "dust" ? 2 : 1);
      }
    }
    ctx.globalAlpha = 1;

    // night + dusk tint, then lanterns on top
    if (day.dark > 0) {
      ctx.fillStyle = `rgba(10,10,34,${0.55 * day.dark})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (day.dusk > 0) {
      ctx.fillStyle = `rgba(255,107,53,${0.12 * day.dusk})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    // pixel vignette
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, vw, 2);
    ctx.fillRect(0, vh - 2, vw, 2);
    ctx.fillRect(0, 0, 2, vh);
    ctx.fillRect(vw - 2, 0, 2, vh);
    if (day.dark > 0.25) {
      ctx.globalCompositeOperation = "lighter";
      const flick = 0.85 + 0.15 * Math.sin(t / 120);
      for (const l of lights) {
        const lx = Math.round(l.x);
        const ly = Math.round(l.y);
        ctx.fillStyle = `rgba(245,166,35,${0.05 * day.dark * flick})`;
        diamond(ctx, lx, ly + 4, 16, ctx.fillStyle);
        diamond(ctx, lx, ly + 3, 10, ctx.fillStyle);
        ctx.fillRect(lx - 5, ly - 4, 10, 8);
        ctx.fillStyle = `rgba(255,210,63,${0.9 * day.dark})`;
        ctx.fillRect(lx - 1, ly - 1, 2, 2);
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }

  // ───────────────────────────── input ─────────────────────────────

  private unbind?: () => void;

  private toWorld(e: PointerEvent): P {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * this.canvas.width + this.cam.x;
    const y = ((e.clientY - r.top) / r.height) * this.canvas.height + this.cam.y;
    return { x, y };
  }

  private hitWalker(p: P): Walker | null {
    let best: Walker | null = null;
    for (const w of this.walkers) {
      if (!w.jobId) continue;
      const s = this.toScreen(w.pos.x, w.pos.y);
      if (Math.abs(p.x - s.x) <= 8 && p.y >= s.y - SPRITE_H - 2 && p.y <= s.y + 3) best = w;
    }
    return best;
  }

  private hit(p: P): string | null {
    const list = this.visibleAgents(Date.now());
    let best: { id: string; y: number } | null = null;
    for (const a of list) {
      const slot = this.slotOf.get(a.id);
      if (slot === undefined) continue;
      const c = this.slotCenter(slot);
      const s = this.toScreen(c.x, c.y);
      const st = a.diedAt ? { hw: 13, H: 20 } : this.stall(a.type, this.sizeOf.get(a.id) ?? 0);
      const inside = p.x >= s.x - st.hw - 2 && p.x <= s.x + st.hw + 2 && p.y >= s.y - st.H - st.hw / 2 - 12 && p.y <= s.y + st.hw / 2;
      if (inside && (!best || s.y > best.y)) best = { id: a.id, y: s.y };
    }
    return best?.id ?? null;
  }

  private bindPointer() {
    const c = this.canvas;
    const down = (e: PointerEvent) => {
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false };
    };
    const move = (e: PointerEvent) => {
      if (this.drag) {
        const r = c.getBoundingClientRect();
        const k = this.canvas.width / r.width;
        const dx = (e.clientX - this.drag.x) * k;
        const dy = (e.clientY - this.drag.y) * k;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
          this.drag.moved = true;
          if (!c.hasPointerCapture(e.pointerId)) c.setPointerCapture(e.pointerId);
        }
        if (this.drag.moved) {
          this.cam.x = this.drag.cx - dx;
          this.cam.y = this.drag.cy - dy;
          this.userPanAt = Date.now();
          this.camTarget = null;
          this.clampCam();
        }
        return;
      }
      if (e.pointerType === "mouse") {
        const p = this.toWorld(e);
        const id = this.hitWalker(p) ? null : this.hit(p);
        if (id !== this.hovered) {
          this.hovered = id;
          c.style.cursor = id ? "pointer" : "grab";
          this.opts.onHover(id);
        }
      }
    };
    const up = (e: PointerEvent) => {
      if (this.drag && !this.drag.moved) {
        const p = this.toWorld(e);
        const wk = this.hitWalker(p);
        if (wk?.jobId) {
          this.selected = null;
          this.opts.onSelect({ job: wk.jobId });
        } else {
          const id = this.hit(p);
          this.selected = id;
          this.opts.onSelect(id ? { agent: id } : null);
        }
      }
      this.drag = null;
    };
    const leave = () => {
      this.hovered = null;
      this.opts.onHover(null);
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", () => (this.drag = null));
    c.addEventListener("pointerleave", leave);
    this.unbind = () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointerleave", leave);
    };
  }
}

function hex(c: string) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number) {
  const A = hex(a);
  const B = hex(b);
  const k = Math.max(0, Math.min(1, t));
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * k));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
