// Scout brain: watch the pump.fun feed, pick a coin, justify it.
// Feature extraction is code; the ranking and the one-line reason are Claude.
// With no feed data (fresh start, websocket down) or no LLM, it falls back
// to the heuristic score so a job always completes.

import { z } from "zod";
import type { Agent } from "../../lib/types";
import type { PumpFeed, TokenStats } from "../pumpportal";
import { ask } from "./llm";

export interface Pick {
  mint: string;
  ticker: string;
  reason: string;
  /** 0..1 */
  confidence: number;
}

const PickSchema = z.object({
  mint: z.string(),
  reason: z.string().max(200),
  confidence: z.number().min(0).max(1),
});

const SYSTEM = `You are a pump.fun scout agent selling picks to launcher agents in an agent-to-agent market.
You get a shortlist of freshly launched coins with trading stats. Pick the ONE most likely to keep attracting buyers over the next hour.
Prefer: rising unique traders, net buy volume, dev wallet has not sold, recent trades, a clear narrative in the name.
Avoid: dev sold, one-trader volume, stale coins.
Answer in the agent's voice (short, confident, no hedging, no financial advice disclaimers). The reason is one sentence under 120 characters.`;

function describe(t: TokenStats, now: number) {
  return {
    mint: t.mint,
    name: t.name,
    symbol: t.symbol,
    ageMinutes: Math.round((now - t.createdAt) / 60_000),
    trades: t.trades,
    buys: t.buys,
    sells: t.sells,
    netBuySol: +(t.buyVolumeSol - t.sellVolumeSol).toFixed(3),
    uniqueTraders: t.traders.size,
    marketCapSol: +t.marketCapSol.toFixed(2),
    minutesSinceLastTrade: Math.round((now - t.lastTradeAt) / 60_000),
    devSold: t.devSold,
  };
}

export interface MarketCoin {
  mint: string;
  ticker: string;
  name: string;
  reputation: number;
}

export async function scoutPick(scout: Agent, hirer: Agent, feed: PumpFeed, marketCoins: MarketCoin[] = []): Promise<Pick> {
  const now = Date.now();
  const cands = feed.candidates(8);
  if (!cands.length) {
    // no live feed data: pick from the market's own launchers, weighted by reputation
    const pool = marketCoins.filter((c) => c.mint && c.mint !== hirer.coinCA);
    if (!pool.length) return { mint: "", ticker: "", reason: "Feed is quiet. No pick worth paying for right now — sit on your SOL.", confidence: 0.2 };
    const weights = pool.map((c) => Math.max(5, c.reputation));
    let x = Math.random() * weights.reduce((a, b) => a + b, 0);
    let c = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      x -= weights[i];
      if (x <= 0) {
        c = pool[i];
        break;
      }
    }
    const phrase = scout.persona?.catchphrase ? ` — "${scout.persona.catchphrase}"` : "";
    return { mint: c.mint, ticker: c.ticker, reason: `In-house pick while the feed is quiet: $${c.ticker} by ${c.name}, rep ${c.reputation}${phrase}`, confidence: 0.35 + c.reputation / 400 };
  }
  const shortlist = cands.map((t) => describe(t, now));
  const user = `Scout: ${scout.name}. Catchphrase: "${scout.persona?.catchphrase ?? ""}".
Hirer: ${hirer.name}, a launcher with coin $${hirer.ticker}.
Shortlist (JSON): ${JSON.stringify(shortlist)}
Pick one mint from the shortlist.`;
  const out = await ask(SYSTEM, user, PickSchema, 512);
  const chosen = out ? cands.find((t) => t.mint === out.mint) : undefined;
  if (out && chosen) {
    return { mint: chosen.mint, ticker: chosen.symbol, reason: out.reason, confidence: out.confidence };
  }
  // heuristic fallback: the top scorer
  const t = cands[0];
  const reason = `$${t.symbol}: ${t.traders.size} traders, ${(t.buyVolumeSol - t.sellVolumeSol).toFixed(2)} SOL net buys${t.devSold ? ", dev sold (risky)" : ", dev holding"}.`;
  return { mint: t.mint, ticker: t.symbol, reason, confidence: t.devSold ? 0.3 : 0.6 };
}

/** How good was the pick? Re-read the feed later and compare. -1..1 */
export function gradePick(feed: PumpFeed, mint: string, mcapAtPick: number): number {
  const t = feed.tokens.get(mint);
  if (!t || !mcapAtPick) return 0;
  const r = (t.marketCapSol - mcapAtPick) / Math.max(mcapAtPick, 1);
  return Math.max(-1, Math.min(1, r)) * (t.devSold ? 0.5 : 1);
}
