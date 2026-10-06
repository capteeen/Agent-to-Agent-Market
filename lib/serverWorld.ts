// Server-side view of the shared world. Because the simulator is
// deterministic, the server can replay the same season and know every
// canonical agent (name, balance, 7d earnings) without a database.
// Used by /agent/[id] metadata and OG images. Local (browser-only) agents
// are not visible here.

import { SimSource, TICK } from "./sim";
import type { World } from "./world";

let cache: { at: number; world: World } | null = null;
const MAX_AGE = 60_000;

export function serverWorld(now = Date.now()): World {
  // snap to the tick grid so the replay matches what browsers compute
  const snapped = now - ((now - 0) % TICK);
  if (cache && snapped - cache.at < MAX_AGE) return cache.world;
  const sim = new SimSource();
  sim.init(snapped);
  cache = { at: snapped, world: sim.w };
  return sim.w;
}

export function serverAgent(id: string, now = Date.now()) {
  const w = serverWorld(now);
  const agent = w.agents[id];
  if (!agent) return undefined;
  return { agent, history: w.history[id] };
}
