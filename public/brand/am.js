(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // components/market/draw.ts
  var draw_exports = {};
  __export(draw_exports, {
    GROUND: () => GROUND,
    SPRITE_HALF: () => SPRITE_HALF,
    STALL_SIZES: () => STALL_SIZES,
    TH: () => TH,
    TW: () => TW,
    TYPE_TONES: () => TYPE_TONES,
    blit: () => blit,
    box: () => box,
    buildCloud: () => buildCloud,
    buildCoin: () => buildCoin,
    buildGround: () => buildGround,
    buildProps: () => buildProps,
    buildRubble: () => buildRubble,
    buildSprites: () => buildSprites,
    buildStall: () => buildStall,
    diamond: () => diamond,
    leftFace: () => leftFace,
    rightFace: () => rightFace
  });

  // lib/sprites.ts
  var sprites_exports = {};
  __export(sprites_exports, {
    BELL: () => BELL,
    BELL_PAL: () => BELL_PAL,
    COIN: () => COIN,
    COIN_PAL: () => COIN_PAL,
    SPRITE_H: () => SPRITE_H,
    SPRITE_W: () => SPRITE_W,
    TOMB: () => TOMB,
    TOMB_PAL: () => TOMB_PAL,
    agentPalette: () => agentPalette,
    agentSprite: () => agentSprite,
    eachPixel: () => eachPixel,
    gridToSvg: () => gridToSvg,
    svgDataUrl: () => svgDataUrl
  });
  var SPRITE_W = 14;
  var SPRITE_H = 18;
  var BODY = [
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
    ".............."
  ];
  var LEGS_WALK = ["..kDDDkkDDDk..", "..kDDk..kDDk..", ".kFFk....kFFk.", ".kkkk....kkkk.", ".............."];
  var PALETTES = {
    launcher: {
      k: "#1b1110",
      H: "#ff6b35",
      I: "#c44a1c",
      s: "#f2c79b",
      e: "#1b1110",
      A: "#e0571f",
      B: "#b8441c",
      C: "#ffa06e",
      D: "#4a2a1a",
      F: "#2a1a10",
      G: "#5bc0eb",
      Y: "#ffd23f",
      w: "#f4f4f2"
    },
    scout: {
      k: "#0f1a12",
      H: "#2f8f4e",
      I: "#1f6a37",
      s: "#e9b98e",
      e: "#0f1a12",
      A: "#3aa35c",
      B: "#237040",
      C: "#7fd99a",
      D: "#2a3b2a",
      F: "#162416",
      G: "#5bc0eb",
      Y: "#c9f27a",
      w: "#f4f4f2"
    },
    shiller: {
      k: "#160f1f",
      H: "#8a4fff",
      I: "#5f2fc4",
      s: "#f0c09a",
      e: "#160f1f",
      A: "#9b5cff",
      B: "#6a35c4",
      C: "#c9a6ff",
      D: "#3a2a55",
      F: "#1e1430",
      G: "#5bc0eb",
      M: "#f4f4f2",
      m: "#ff5fa2",
      Y: "#ff5fa2",
      w: "#f4f4f2"
    }
  };
  var OVERLAYS = {
    // rocket helmet: visor goggles on the brim, a flame-coloured crest
    launcher: [
      [0, 6, "Y"],
      [0, 7, "Y"],
      [4, 3, "k"],
      [4, 4, "G"],
      [4, 5, "G"],
      [4, 6, "k"],
      [4, 7, "k"],
      [4, 8, "G"],
      [4, 9, "G"],
      [4, 10, "k"],
      [11, 6, "Y"],
      [11, 7, "Y"]
    ],
    // hood down the sides of the face, binoculars over the eyes
    scout: [
      [5, 3, "H"],
      [5, 10, "H"],
      [6, 3, "H"],
      [6, 10, "H"],
      [7, 3, "H"],
      [7, 10, "H"],
      [6, 4, "k"],
      [6, 5, "G"],
      [6, 6, "k"],
      [6, 7, "k"],
      [6, 8, "G"],
      [6, 9, "k"],
      [11, 4, "Y"],
      [11, 9, "Y"]
    ],
    // cap with a peak, megaphone in the right hand
    shiller: [
      [4, 11, "I"],
      [4, 12, "k"],
      [9, 11, "k"],
      [9, 12, "k"],
      [10, 12, "m"],
      [10, 13, "k"],
      [11, 12, "k"],
      [11, 13, "k"],
      [10, 11, "M"],
      [11, 6, "Y"],
      [11, 7, "Y"]
    ]
  };
  function agentSprite(type, frame = 0) {
    const rows = BODY.map((r) => r.split(""));
    if (frame % 2 === 1) LEGS_WALK.forEach((r, i) => rows[13 + i] = r.split(""));
    for (const [y, x, c] of OVERLAYS[type]) rows[y][x] = c;
    return rows.map((r) => r.join(""));
  }
  var agentPalette = (type) => PALETTES[type];
  var COIN = [
    "..kkk..",
    ".kYYYk.",
    "kYwYYYk",
    "kYYbYYk",
    "kYYYYYk",
    ".kYYYk.",
    "..kkk.."
  ];
  var COIN_PAL = { k: "#5a3a00", Y: "#f5a623", w: "#fff6c8", b: "#c77d00" };
  var TOMB = [
    "..kkkk..",
    ".kGGGGk.",
    "kGGGGGGk",
    "kGGkkGGk",
    "kGkGGkGk",
    "kGGkkGGk",
    "kGGGGGGk",
    "kGgGGgGk",
    "kkkkkkkk"
  ];
  var TOMB_PAL = { k: "#2a2420", G: "#8d8579", g: "#6f685d" };
  var BELL = [
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
    ".....kk....."
  ];
  var BELL_PAL = { k: "#3a2400", Y: "#f5a623", w: "#fff1b0" };
  function eachPixel(grid, pal, fn) {
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
  function gridToSvg(grid, pal, scale = 1) {
    const w = grid[0].length;
    const h = grid.length;
    let rects = "";
    eachPixel(grid, pal, (x, y, c) => {
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`;
  }
  var svgDataUrl = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  // components/market/draw.ts
  var TW = 32;
  var TH = 16;
  function diamond(ctx, cx, cy, hw, color) {
    const hh = hw / 2;
    ctx.fillStyle = color;
    for (let dy = -hh; dy < hh; dy++) {
      const t = 1 - Math.abs(dy + 0.5) / hh;
      const w = Math.round(hw * t);
      if (w > 0) ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2, 1);
    }
  }
  function leftFace(ctx, cx, cy, hw, h, color) {
    ctx.fillStyle = color;
    for (let x = 0; x < hw; x++) ctx.fillRect(Math.round(cx - hw + x), Math.round(cy + x / 2), 1, h);
  }
  function rightFace(ctx, cx, cy, hw, h, color) {
    ctx.fillStyle = color;
    for (let x = 0; x < hw; x++) ctx.fillRect(Math.round(cx + x), Math.round(cy + hw / 2 - x / 2), 1, h);
  }
  function box(ctx, cx, groundY, hw, h, top, left, right) {
    const ty = groundY - h;
    leftFace(ctx, cx, ty, hw, h, left);
    rightFace(ctx, cx, ty, hw, h, right);
    diamond(ctx, cx, ty, hw, top);
  }
  function blit(ctx, grid, pal, x, y) {
    eachPixel(grid, pal, (px2, py, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(x + px2, y + py, 1, 1);
    });
  }
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    return [c, ctx];
  }
  var px = (ctx, x, y, c, w = 1, h = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  var TYPE_TONES = {
    launcher: { base: "#ff6b35", light: "#ffa06e", dark: "#b8441c", darker: "#7a2c12" },
    scout: { base: "#3aa35c", light: "#7fd99a", dark: "#237040", darker: "#164a2a" },
    shiller: { base: "#9b5cff", light: "#c9a6ff", dark: "#6a35c4", darker: "#44207f" }
  };
  var WOOD = { top: "#b07a48", light: "#c9915a", side: "#6b4425", dark: "#4e301a", post: "#3a2414" };
  var CREAM = "#f4e9d2";
  var CREAM_D = "#cfc2a8";
  function buildSprites() {
    const out = {};
    for (const t of ["launcher", "scout", "shiller"]) {
      const frames = [];
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
  var SPRITE_HALF = SPRITE_W / 2;
  function buildCoin() {
    const [c, ctx] = canvas(7, 7);
    blit(ctx, COIN, COIN_PAL, 0, 0);
    return c;
  }
  var STALL_SIZES = [
    { hw: 10, H: 24 },
    { hw: 14, H: 31 },
    { hw: 19, H: 40 }
  ];
  function stripeIdx(x, dy) {
    return Math.floor((x + 2 * dy + 400) / 5) % 2 === 0;
  }
  function awning(o, ax, acy, aw, tone) {
    const ahh = aw / 2;
    for (let dy = -ahh; dy < ahh; dy++) {
      const t = 1 - Math.abs(dy + 0.5) / ahh;
      const ww = Math.round(aw * t);
      for (let x = -ww; x < ww; x++) {
        const s = stripeIdx(x, dy);
        const shade = x > 0 && dy > -ahh * 0.5;
        o.fillStyle = s ? shade ? tone.dark : tone.base : shade ? CREAM_D : CREAM;
        o.fillRect(Math.round(ax + x), Math.round(acy + dy), 1, 1);
      }
    }
    for (let x = 0; x < aw; x++) {
      const lx = -aw + x;
      const s = stripeIdx(lx, x / 2);
      const scallop = x % 4 === 3 ? 2 : 3;
      o.fillStyle = s ? tone.dark : CREAM_D;
      o.fillRect(Math.round(ax + lx), Math.round(acy + x / 2), 1, scallop);
      o.fillStyle = s ? tone.darker : "#a89b84";
      o.fillRect(Math.round(ax + x), Math.round(acy + ahh - x / 2), 1, x % 4 === 3 ? 2 : 3);
    }
    px(o, ax - 1, acy - ahh, tone.light, 2, 1);
    px(o, ax - 1, acy - ahh - 1, WOOD.post, 2, 1);
  }
  function goods(o, type, cx, cy) {
    if (type === "launcher") {
      px(o, cx - 5, cy - 7, "#1b1110", 3, 1);
      px(o, cx - 5, cy - 6, "#ff6b35", 3, 4);
      px(o, cx - 4, cy - 8, "#ffd23f", 1, 1);
      px(o, cx - 4, cy - 2, "#5bc0eb", 1, 1);
      px(o, cx + 2, cy - 4, "#c77d00", 4, 1);
      px(o, cx + 2, cy - 3, "#f5a623", 4, 1);
      px(o, cx + 2, cy - 2, "#c77d00", 4, 1);
      px(o, cx + 2, cy - 1, "#f5a623", 4, 1);
    } else if (type === "scout") {
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
  function buildStall(type, size) {
    const { hw, H } = STALL_SIZES[size];
    const hh = hw / 2;
    const w = hw * 2 + 12;
    const h = H + hw + 22;
    const ax = w / 2;
    const ay = h - hh - 6;
    const tone = TYPE_TONES[type];
    const lights = [];
    const [under, u] = canvas(w, h);
    u.globalAlpha = 0.35;
    diamond(u, ax + 2, ay + 3, hw + 1, "#000");
    u.globalAlpha = 1;
    box(u, ax, ay + 1, hw, 3, WOOD.top, WOOD.side, WOOD.dark);
    u.fillStyle = WOOD.side;
    for (let dy = -hh + 2; dy < hh - 1; dy += 2) {
      const t = 1 - Math.abs(dy + 0.5) / hh;
      const ww = Math.round((hw - 1) * t);
      if (ww > 0) u.fillRect(Math.round(ax - ww), Math.round(ay - 2 + dy), ww * 2, 1);
    }
    u.fillStyle = WOOD.light;
    u.fillRect(Math.round(ax) - 1, Math.round(ay - 2 - hh + 1), 2, 1);
    px(u, ax - 1, ay - 2 - hh - H + 4, WOOD.post, 2, H - 3);
    px(u, ax, ay - 2 - hh - H + 4, WOOD.side, 1, H - 3);
    const [over, o] = canvas(w, h);
    for (const sx of [ax - hw + 1, ax + hw - 3]) {
      px(o, sx, ay - 2 - H + 2, WOOD.post, 2, H - 1);
      px(o, sx + 1, ay - 2 - H + 2, WOOD.side, 1, H - 1);
    }
    const cw = Math.round(hw * 0.8);
    const counterY = ay - 2 + hh * 0.45;
    box(o, ax, counterY, cw, 6, WOOD.top, WOOD.side, WOOD.dark);
    leftFace(o, ax, counterY - 6, cw, 1, tone.base);
    rightFace(o, ax, counterY - 6, cw, 1, tone.dark);
    leftFace(o, ax, counterY - 4, cw, 2, tone.darker);
    rightFace(o, ax, counterY - 4, cw, 2, tone.darker);
    goods(o, type, ax, counterY - 6 - cw / 2 + 2);
    const aw = hw + 3;
    const acy = ay - 2 - H;
    awning(o, ax, acy, aw, tone);
    const ly = acy + aw / 4 + 5;
    px(o, ax + hw - 2, ly - 1, WOOD.post, 1, 1);
    px(o, ax + hw - 3, ly, "#3a2400", 3, 1);
    px(o, ax + hw - 3, ly + 1, "#ffd23f", 3, 2);
    px(o, ax + hw - 3, ly + 3, "#3a2400", 3, 1);
    lights.push({ x: hw - 2, y: ly + 2 - ay });
    if (size >= 1) {
      const fy = acy - aw / 2 - 8;
      px(o, ax - 1, fy, WOOD.post, 1, 8);
      px(o, ax, fy, tone.base, 5, 1);
      px(o, ax, fy + 1, tone.base, 4, 1);
      px(o, ax, fy + 2, tone.light, 3, 1);
      px(o, ax, fy + 3, tone.base, 2, 1);
    }
    if (size >= 2) {
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
  function buildRubble(type) {
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
    u.fillStyle = "#2a241f";
    for (let i = 0; i < 10; i++) u.fillRect(Math.round(ax - 9 + i * 7 % 18), Math.round(ay - 4 + i * 5 % 8), 2, 1);
    const [over, o] = canvas(w, h);
    blit(o, TOMB, TOMB_PAL, Math.round(ax - 4), ay - 15);
    box(o, ax - 8, ay + 2, 4, 3, "#4a423a", "#2e2823", "#241f1a");
    px(o, ax - 12, ay - 3, "#2e2823", 9, 2);
    px(o, ax + 3, ay + 1, "#3a2414", 7, 2);
    box(o, ax - 2, ay + 5, 3, 2, "#8d8579", "#6a6259", "#555048");
    px(o, ax + 4, ay - 4, tone.base, 3, 2);
    px(o, ax + 7, ay - 4, CREAM, 2, 2);
    px(o, ax + 9, ay - 3, tone.dark, 2, 1);
    return { under, over, ax, ay, hw, H: 14, lights: [] };
  }
  var GROUND = {
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
    rock: "#3a2a1c"
  };
  function buildGround(Gx, Gy, kind, toScreen, w, h) {
    const [c, ctx] = canvas(w, h);
    let seed = 7;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
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
  function buildProps() {
    const out = {};
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
    {
      const [c, o] = canvas(11, 8);
      blit(o, ["...kkkkk...", ".kkGGLGGkk.", "kGGGGGGGGGk", "kGLGGGGDGGk", ".kGGGDDGGk.", "..kkkkkkk.."], { k: "#1b2a14", G: "#3f6e35", L: "#6fa84f", D: "#2f5226" }, 0, 1);
      out.bush = { img: c, ax: 5, ay: 7 };
    }
    {
      const [c, o] = canvas(8, 10);
      blit(o, [".kkkkkk.", "kBBBBBBk", "kbbbbbbk", "kBBBBBBk", "kBBBBBBk", "kbbbbbbk", "kBBBBBBk", ".kkkkkk."], { k: "#2a1a0e", B: "#8a5a30", b: "#4e301a" }, 0, 1);
      out.barrel = { img: c, ax: 4, ay: 9 };
    }
    {
      const [c, o] = canvas(10, 10);
      box(o, 5, 9, 4, 5, "#c9915a", "#8a5a30", "#6b4425");
      px(o, 2, 6, "#4e301a", 1, 2);
      px(o, 7, 6, "#4e301a", 1, 2);
      out.crate = { img: c, ax: 5, ay: 9 };
    }
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
    {
      const [c, o] = canvas(12, 16);
      px(o, 5, 4, "#3a2414", 2, 12);
      px(o, 1, 3, "#2a1a0e", 10, 5);
      px(o, 2, 4, "#b07a48", 8, 3);
      px(o, 3, 5, "#f5a623", 2, 1);
      px(o, 6, 5, "#f5a623", 3, 1);
      out.sign = { img: c, ax: 6, ay: 15 };
    }
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
  function buildCloud(seed) {
    const [c, o] = canvas(26, 9);
    let s = seed;
    const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
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

  // components/market/font.ts
  var font_exports = {};
  __export(font_exports, {
    drawText: () => drawText,
    labelCanvas: () => labelCanvas,
    textWidth: () => textWidth
  });
  var G = {
    A: "010101111101101",
    B: "110101110101110",
    C: "011100100100011",
    D: "110101101101110",
    E: "111100110100111",
    F: "111100110100100",
    G: "011100101101011",
    H: "101101111101101",
    I: "111010010010111",
    J: "001001001101010",
    K: "101101110101101",
    L: "100100100100111",
    M: "101111111101101",
    N: "110101101101101",
    O: "010101101101010",
    P: "110101110100100",
    Q: "010101101110011",
    R: "110101110101101",
    S: "011100010001110",
    T: "111010010010010",
    U: "101101101101111",
    V: "101101101101010",
    W: "101101111111101",
    X: "101101010101101",
    Y: "101101010010010",
    Z: "111001010100111",
    "0": "111101101101111",
    "1": "010110010010111",
    "2": "110001010100111",
    "3": "110001010001110",
    "4": "101101111001001",
    "5": "111100110001110",
    "6": "011100111101111",
    "7": "111001010010010",
    "8": "111101111101111",
    "9": "111101111001110",
    $: "011110010011110",
    ".": "000000000000010",
    "+": "000010111010000",
    "-": "000000111000000",
    _: "000000000000111",
    ":": "000010000010000",
    "!": "010010010000010",
    "?": "110001010000010",
    " ": "000000000000000"
  };
  function textWidth(s) {
    return s.length * 4 - 1;
  }
  function drawText(ctx, s, x, y, color) {
    ctx.fillStyle = color;
    const up = s.toUpperCase();
    for (let i = 0; i < up.length; i++) {
      const g = G[up[i]] ?? G["?"];
      for (let p = 0; p < 15; p++) {
        if (g[p] === "1") ctx.fillRect(Math.round(x + i * 4 + p % 3), Math.round(y + Math.floor(p / 3)), 1, 1);
      }
    }
  }
  function labelCanvas(s, fg, bg = "#6b4a2c", border = "#2a1a0e") {
    const w = textWidth(s) + 6;
    const h = 11;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = border;
    ctx.fillRect(0, 1, w, h - 1);
    ctx.fillStyle = bg;
    ctx.fillRect(1, 2, w - 2, h - 3);
    ctx.fillStyle = "#8a5a30";
    ctx.fillRect(1, 2, w - 2, 1);
    ctx.fillStyle = "#d9c9a8";
    ctx.fillRect(2, 3, 1, 1);
    ctx.fillRect(w - 3, 3, 1, 1);
    ctx.fillStyle = border;
    ctx.fillRect(Math.floor(w / 2) - 2, 0, 1, 1);
    ctx.fillRect(Math.floor(w / 2) + 1, 0, 1, 1);
    drawText(ctx, s, 3, 4, fg);
    return c;
  }

  // ../../../tmp/claude-0/-home-user-Agent-to-Agent-Market/42df6fd6-2434-532c-9617-0ee0031c64dd/scratchpad/brand/entry.ts
  window.AM = { ...draw_exports, ...sprites_exports, ...font_exports };
})();
