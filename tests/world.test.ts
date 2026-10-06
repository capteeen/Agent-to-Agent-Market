import { describe, expect, it } from "vitest";
import { computeReport, runwayHours, seasonIndex, seasonStart } from "@/lib/world";
import { SEASON_MS, SEASON_ORIGIN, type Agent, type Job } from "@/lib/types";

const job = (p: Partial<Job>): Job => ({ id: "j", hirerId: "h", workerId: "w", service: "pick", price: 0.1, status: "done", createdAt: 0, completedAt: 10, ...p });

describe("seasons", () => {
  it("map any time to a week-long season starting at the origin", () => {
    expect(seasonIndex(SEASON_ORIGIN)).toBe(0);
    expect(seasonStart(SEASON_ORIGIN + 3 * 86400e3)).toBe(SEASON_ORIGIN);
    expect(seasonIndex(SEASON_ORIGIN + SEASON_MS)).toBe(1);
  });
});

describe("computeReport", () => {
  it("finds the top earner, top hirer and biggest job of the hour", () => {
    const jobs = [
      job({ id: "a", workerId: "w1", hirerId: "h1", price: 0.1, completedAt: 100 }),
      job({ id: "b", workerId: "w2", hirerId: "h1", price: 0.3, completedAt: 200 }),
      job({ id: "c", workerId: "w1", hirerId: "h2", price: 0.25, completedAt: 300 }),
      job({ id: "old", workerId: "w9", hirerId: "h9", price: 9, completedAt: -5 }),
      job({ id: "failed", status: "failed", price: 9, completedAt: 50 }),
      job({ id: "local", local: true, price: 9, completedAt: 60 }),
    ];
    const r = computeReport(jobs, { w2: 0.1 }, 0);
    expect(r.jobs).toBe(3);
    expect(r.volume).toBeCloseTo(0.65);
    expect(r.topHirer).toEqual({ agentId: "h1", amount: 0.4 });
    expect(r.topEarner?.agentId).toBe("w2"); // 0.3 job + 0.1 fees > w1's 0.35
    expect(r.biggestJob).toEqual({ jobId: "b", amount: 0.3 });
  });
});

describe("runwayHours", () => {
  const agent = { balance: 1, diedAt: undefined } as Agent;
  it("is infinite when income beats spend", () => {
    const h = { balance: [], income: [1, 1, 1, 1, 1, 1], spend: [0, 0, 0, 0, 0, 0] };
    expect(runwayHours(agent, h)).toBe(Infinity);
  });
  it("divides balance by the average net burn", () => {
    const h = { balance: [], income: [0, 0, 0, 0, 0, 0], spend: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] };
    expect(runwayHours(agent, h)).toBeCloseTo(2);
  });
});
