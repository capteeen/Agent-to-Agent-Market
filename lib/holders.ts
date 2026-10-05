import { fakeWallet, hashStr, mulberry32 } from "./rng";

/** Mock holder distribution for an agent's coin. Phase 2: read from chain (getTokenLargestAccounts). */
export function mockHolders(agentId: string, dead: boolean) {
  const r = mulberry32(hashStr(agentId));
  const total = dead ? Math.floor(20 + r() * 60) : Math.floor(120 + r() * 2400);
  let left = 100;
  const top = Array.from({ length: 8 }, (_, i) => {
    const pct = i === 0 ? 3 + r() * 6 : Math.min(left, 0.6 + r() * 3);
    left -= pct;
    return { wallet: fakeWallet(r), pct, tag: i === 0 ? "bonding curve" : i === 1 ? "dev (agent)" : undefined };
  });
  top[0].pct = 20 + r() * 40;
  return { total, top };
}
