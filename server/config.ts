// All server configuration in one place. Everything has a safe default:
// paper settlement, devnet, no LLM, no X — the engine runs end-to-end with
// nothing configured, and each real integration switches on with its keys.

import { clusterApiUrl } from "@solana/web3.js";

const env = (k: string, d = "") => process.env[k] ?? d;

export const CONFIG = {
  port: Number(env("MARKET_PORT", "4000")),
  dataDir: env("MARKET_DATA_DIR", "./data"),
  dbFile: env("MARKET_DB", "./data/market.sqlite"),
  /** "paper" (internal ledger) or "live" (real Solana transfers) */
  settlement: env("MARKET_SETTLEMENT", "paper") as "paper" | "live",
  cluster: env("SOLANA_CLUSTER", "devnet"),
  rpc: env("SOLANA_RPC", "") || clusterApiUrl((env("SOLANA_CLUSTER", "devnet") as "devnet" | "mainnet-beta" | "testnet") ?? "devnet"),
  /** real pump.fun launches and fee claims (mainnet only) */
  pumpLive: env("PUMP_LIVE", "0") === "1",
  /** connect to the PumpPortal data websocket for the Scout feed */
  pumpFeed: env("PUMP_FEED", "1") === "1",
  /** origins allowed to call the API (the Next.js app) */
  corsOrigin: env("MARKET_CORS_ORIGIN", "*"),
  /** economy */
  tickMs: 1000,
  rentPerHour: { launcher: 0.012, scout: 0.009, shiller: 0.009 } as const,
  /** paper-mode creator fees per hour for a launcher at ×1 (scaled by boost) */
  paperFeePerHour: 0.06,
  jobEveryMs: [3000, 8000] as const,
  jobExpiryMs: [25_000, 60_000] as const,
  workMs: [5000, 20_000] as const,
  feeClaimEveryMs: 10 * 60_000,
  balanceRefreshMs: 10_000,
  historyHours: 168,
  rubbleMs: 24 * 3600_000,
};

export type Config = typeof CONFIG;
