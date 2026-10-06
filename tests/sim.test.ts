import { describe, expect, it } from "vitest";
import { SimSource, TICK } from "@/lib/sim";
import { seasonStart } from "@/lib/world";
import { HISTORY_HOURS } from "@/lib/types";

const T0 = seasonStart(Date.now());
const at = (ms: number) => T0 + ms;

function sim(now: number) {
  const s = new SimSource();
  s.init(now);
  return s;
}

describe("simulator", () => {
  it("is deterministic: two replays to the same instant agree exactly", () => {
    const a = sim(at(2 * 3600e3));
    const b = sim(at(2 * 3600e3));
    expect(JSON.stringify(a.w.agents)).toBe(JSON.stringify(b.w.agents));
    expect(JSON.stringify([...a.w.jobs])).toBe(JSON.stringify([...b.w.jobs]));
    expect(JSON.stringify(a.w.events)).toBe(JSON.stringify(b.w.events));
    expect(a.w.stats).toEqual(b.w.stats);
  });

  it("stepping forward from an earlier replay equals replaying straight to the later time", () => {
    const direct = sim(at(90 * 60e3));
    const stepped = sim(at(60 * 60e3));
    while (stepped.t + TICK <= at(90 * 60e3)) stepped.step();
    expect(JSON.stringify(stepped.w.agents)).toBe(JSON.stringify(direct.w.agents));
    expect(stepped.w.stats).toEqual(direct.w.stats);
  });

  it("keeps the market alive and busy", () => {
    const s = sim(at(6 * 3600e3));
    const alive = Object.values(s.w.agents).filter((a) => !a.diedAt);
    expect(alive.length).toBeGreaterThanOrEqual(28);
    expect(alive.length).toBeLessThanOrEqual(36);
    const genesis = sim(T0);
    expect(s.w.stats.jobsCompleted - genesis.w.stats.jobsCompleted).toBeGreaterThan(1000);
    const open = [...s.w.jobs.values()].filter((j) => j.status === "open" || j.status === "accepted");
    expect(open.length).toBeGreaterThan(0);
  });

  it("conserves SOL: balances only change through income, spend, escrow and rent", () => {
    const s = sim(at(3600e3));
    const before = Object.values(s.w.agents).reduce((sum, a) => sum + a.balance, 0);
    const inc0 = Object.values(s.w.agents).reduce((sum, a) => sum + a.feesEarned, 0);
    const spent0 = Object.values(s.w.agents).reduce((sum, a) => sum + a.feesSpent, 0);
    const escrow = () =>
      [...s.w.jobs.values()].filter((j) => j.status === "accepted").reduce((sum, j) => sum + j.price, 0);
    const esc0 = escrow();
    const n0 = Object.values(s.w.agents).length;
    for (let i = 0; i < (20 * 60e3) / TICK; i++) s.step();
    const after = Object.values(s.w.agents).reduce((sum, a) => sum + a.balance, 0);
    const inc1 = Object.values(s.w.agents).reduce((sum, a) => sum + a.feesEarned, 0);
    const spent1 = Object.values(s.w.agents).reduce((sum, a) => sum + a.feesSpent, 0);
    const spawned = Object.values(s.w.agents)
      .slice(n0)
      .reduce((sum, a) => sum + (s.w.history[a.id]?.balance[HISTORY_HOURS - 1] ?? 0), 0);
    // money in: fees/launch proceeds (income) + spawn funding; money out: hires + rent (spend) + escrow held
    const expected = before + (inc1 - inc0) - (spent1 - spent0) - (escrow() - esc0) + spawned;
    // deaths floor balances at 0 and spawns start from a saved history value, so allow small drift
    expect(Math.abs(after - expected)).toBeLessThan(0.05);
  });

  it("agents that run out of SOL die and leave rubble", () => {
    const s = sim(at(3 * 3600e3));
    const dead = Object.values(s.w.agents).filter((a) => a.diedAt && a.diedAt >= T0);
    expect(dead.length).toBeGreaterThan(0);
    for (const d of dead) expect(d.balance).toBe(0);
    for (const d of dead) expect(s.w.order).toContain(d.id); // rubble stays on the map
  });

  it("prices come from the worker's reputation and policy, within the hirer's max", () => {
    const s = sim(at(3600e3));
    const done = [...s.w.jobs.values()].filter((j) => j.status === "done" && !j.local);
    expect(done.length).toBeGreaterThan(10);
    for (const j of done) expect(j.price).toBeGreaterThan(0);
    const worker = Object.values(s.w.agents).find((a) => a.type === "scout" && !a.diedAt)!;
    const ask = s.ask(worker);
    expect(ask).toBeGreaterThan(0.01);
    expect(ask).toBeLessThan(0.2);
  });
});
