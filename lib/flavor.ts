// Text generators for the mock simulator. Phase 2 replaces these with real
// LLM output (Shiller posts) and real pump.fun data (Scout picks).

import { type Rng, pick, irange, range, base58 } from "./rng";
import type { Agent, Job } from "./types";

export const TICKERS = [
  "BONKR", "GIGA", "FROG", "WOJAK", "CHAD", "MOODENG", "PEPU", "GOBLIN", "SNEK", "BRRR",
  "CATGPT", "HODLR", "MOON", "PUMPKIN", "GOOSE", "RUGLESS", "DEGEN", "BAGZ", "COPE", "WAGMI",
  "SOLDOG", "TENDIE", "BEAN", "KEK", "NOODLE", "ZOOMR", "BLORP", "FWOG", "SHRIMP", "LAMBO",
  "HAMSTR", "YEET", "GRIFT", "MEOW", "BASED", "TOAD", "WIFHAT", "SATO", "PIXL", "ORC",
];

const PICK_REASONS = [
  "3 KOL wallets aped in 10m",
  "bonding curve at {n}% and climbing",
  "dev wallet hasn't sold",
  "holders up {n}% in the last hour",
  "fresh narrative, zero clones yet",
  "volume/mcap ratio is cooked (good)",
  "same deployer as a 40x last week",
  "trending on the pump.fun front page",
];

const THREAD_HOOKS = [
  "🧵 why ${T} is the only chart that matters today",
  "everyone is sleeping on ${T}. here's why",
  "${T} just did something no meme has done before",
  "gm. ${T} szn. a thread",
  "I asked 4 agents about ${T}. all 4 said the same thing",
  "${T} holders, you are early. thread 👇",
];

const FAIL_REASONS = [
  "Worker timed out.",
  "Hirer rejected the result.",
  "Rate limited by X.",
  "Pick rugged before delivery.",
  "Post flagged as spam.",
];

export function jobResult(r: Rng, job: Job, hirer: Agent | undefined): string {
  const T = "$" + (hirer?.ticker ?? pick(r, TICKERS));
  if (job.service === "pick") {
    const coin = "$" + pick(r, TICKERS);
    const reason = pick(r, PICK_REASONS).replace("{n}", String(irange(r, 18, 92)));
    return `Pick: ${coin} (CA ${base58(r, 4)}…pump) — ${reason}.`;
  }
  if (job.service === "attention") {
    const hook = pick(r, THREAD_HOOKS).replace("${T}", T);
    return `Posted: "${hook}" — ${range(r, 1.2, 48).toFixed(1)}k views, ${irange(r, 20, 900)} likes.`;
  }
  const coin = "$" + pick(r, TICKERS);
  return `Launched ${coin} on pump.fun — dev buy ${range(r, 0.1, 1).toFixed(2)} SOL, ${irange(r, 12, 240)} holders in 5m.`;
}

export const failReason = (r: Rng) => pick(r, FAIL_REASONS);

export const SERVICE_VERB = {
  pick: (w: string, h: string, p: string) => `${w} sold a pick to ${h} for ${p} SOL`,
  attention: (w: string, h: string, p: string) => `${w} sold attention to ${h} for ${p} SOL`,
  launch: (w: string, h: string, p: string) => `${w} launched a coin for ${h} for ${p} SOL`,
} as const;
