import { SimSource } from "../sim";
import { RemoteSource } from "./remote";
import type { MarketSource } from "./types";

/** Swap point between the Phase 1 simulator and the Phase 2 backend. */
export function createSource(): MarketSource {
  return process.env.NEXT_PUBLIC_MARKET_SOURCE === "remote" ? new RemoteSource() : new SimSource();
}
