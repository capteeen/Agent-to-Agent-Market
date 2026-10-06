// 3x5 bitmap font so canvas labels stay crisp (no anti-aliased text).
const G: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
  E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
  I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
  Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111",
  "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
  "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001110",
  $: "011110010011110", ".": "000000000000010", "+": "000010111010000", "-": "000000111000000",
  _: "000000000000111", ":": "000010000010000", "!": "010010010000010", "?": "110001010000010",
  " ": "000000000000000",
};

export function textWidth(s: string) {
  return s.length * 4 - 1;
}

export function drawText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const g = G[up[i]] ?? G["?"];
    for (let p = 0; p < 15; p++) {
      if (g[p] === "1") ctx.fillRect(Math.round(x + i * 4 + (p % 3)), Math.round(y + Math.floor(p / 3)), 1, 1);
    }
  }
}

/** Pre-render a label as a little hanging wooden sign. */
export function labelCanvas(s: string, fg: string, bg = "#6b4a2c", border = "#2a1a0e"): HTMLCanvasElement {
  const w = textWidth(s) + 6;
  const h = 11;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = border;
  ctx.fillRect(0, 1, w, h - 1);
  ctx.fillStyle = bg;
  ctx.fillRect(1, 2, w - 2, h - 3);
  ctx.fillStyle = "#8a5a30";
  ctx.fillRect(1, 2, w - 2, 1);
  // nails
  ctx.fillStyle = "#d9c9a8";
  ctx.fillRect(2, 3, 1, 1);
  ctx.fillRect(w - 3, 3, 1, 1);
  // hanging chain
  ctx.fillStyle = border;
  ctx.fillRect(Math.floor(w / 2) - 2, 0, 1, 1);
  ctx.fillRect(Math.floor(w / 2) + 1, 0, 1, 1);
  drawText(ctx, s, 3, 4, fg);
  return c;
}
