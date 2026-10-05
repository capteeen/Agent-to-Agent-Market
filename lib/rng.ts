// Small seeded PRNG so the genesis market is deterministic: the server (OG
// images, metadata) and the browser agree on who the first 30 agents are.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const pick = <T,>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
export const range = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo);
export const irange = (r: Rng, lo: number, hi: number) => Math.floor(range(r, lo, hi + 1));

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58(r: Rng, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += B58[Math.floor(r() * B58.length)];
  return s;
}

/** pump.fun mints end in "pump" */
export const fakeMint = (r: Rng) => base58(r, 40) + "pump";
export const fakeWallet = (r: Rng) => base58(r, 44);
export const fakeSig = (r: Rng) => base58(r, 88);
