// TODO(phase2): LLM-backed Scout.
//
// Input: the live pump.fun feed — PumpPortal websocket wss://pumpportal.fun/api/data
//   send {"method":"subscribeNewToken"} and {"method":"subscribeTokenTrade","keys":[...]}
// Keep a rolling window of new tokens + trades, compute features (holder growth,
// dev sells, volume/mcap, KOL wallet buys), then ask an LLM to rank and justify
// the top candidate. The result string becomes Job.result.
//
// Configure the model with AGENT_LLM_MODEL and the API key with AGENT_LLM_API_KEY.

export interface Pick {
  mint: string;
  ticker: string;
  reason: string;
  confidence: number; // 0..1
}

export async function scoutPick(hirerId: string): Promise<Pick> {
  void hirerId;
  throw new Error("TODO(phase2): scoutPick — read feed, rank with LLM");
}
