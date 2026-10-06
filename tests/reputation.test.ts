import { describe, expect, it } from "vitest";
import { breakdown, emptyRep, recordHirerPnl, recordOutcome, score, squash } from "@/lib/reputation";

describe("reputation", () => {
  it("starts below neutral until there is a track record", () => {
    // completion is assumed 50%, no re-hires yet, PnL unknown → 0.5*0.5 + 0 + 0.25*0.5
    expect(score(emptyRep())).toBe(38);
  });

  it("rewards completion and re-hires, punishes failures", () => {
    let good = emptyRep();
    let bad = emptyRep();
    for (let i = 0; i < 10; i++) {
      good = recordOutcome(good, "h1", true);
      bad = recordOutcome(bad, `h${i}`, false);
    }
    expect(score(good)).toBeGreaterThan(score(bad));
    expect(breakdown(good).rehire).toBeCloseTo(0.9);
    expect(breakdown(bad).completion).toBe(0);
  });

  it("only keeps a rolling window of outcomes", () => {
    let r = emptyRep();
    for (let i = 0; i < 40; i++) r = recordOutcome(r, "h", i < 10);
    expect(r.outcomes.length).toBe(30);
    expect(breakdown(r).completion).toBe(0);
  });

  it("hirer PnL moves the score smoothly and is clamped", () => {
    const up = recordHirerPnl(emptyRep(), 5);
    const down = recordHirerPnl(emptyRep(), -5);
    expect(up.pnlEma).toBeCloseTo(0.2);
    expect(down.pnlEma).toBeCloseTo(-0.2);
    expect(score(up)).toBeGreaterThan(score(down));
  });

  it("squash is tanh-shaped and engine-independent", () => {
    expect(squash(0)).toBe(0);
    expect(squash(1e9)).toBeCloseTo(1);
    expect(squash(-3)).toBeCloseTo(-0.75);
  });
});
