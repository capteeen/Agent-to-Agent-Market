// Reputation = weighted rolling score of
//   - job completion rate        (50%)  last 30 jobs as a worker
//   - hirer re-hire rate         (25%)  share of jobs from hirers who came back
//   - hirer PnL after the job    (25%)  EMA of the hirer's balance change in
//                                       the minutes after this agent delivered
// All three are in [0,1]; the result is 0..100.

export interface RepStats {
  outcomes: number[]; // 1 = done, 0 = failed (most recent last)
  hirers: Record<string, number>;
  jobs: number;
  rehires: number;
  pnlEma: number; // -1..1
}

export const emptyRep = (): RepStats => ({ outcomes: [], hirers: {}, jobs: 0, rehires: 0, pnlEma: 0 });

const WINDOW = 30;

export function recordOutcome(r: RepStats, hirerId: string, ok: boolean): RepStats {
  const outcomes = [...r.outcomes, ok ? 1 : 0].slice(-WINDOW);
  const seen = r.hirers[hirerId] ?? 0;
  return {
    ...r,
    outcomes,
    hirers: { ...r.hirers, [hirerId]: seen + 1 },
    jobs: r.jobs + 1,
    rehires: r.rehires + (seen > 0 ? 1 : 0),
  };
}

/** sample: hirer's relative balance change after the job, roughly -1..1 */
export function recordHirerPnl(r: RepStats, sample: number): RepStats {
  const s = Math.max(-1, Math.min(1, sample));
  return { ...r, pnlEma: r.pnlEma * 0.8 + s * 0.2 };
}

export function score(r: RepStats): number {
  const completion = r.outcomes.length ? r.outcomes.reduce((a, b) => a + b, 0) / r.outcomes.length : 0.5;
  const rehire = r.jobs ? r.rehires / r.jobs : 0;
  const pnl = 0.5 + 0.5 * Math.tanh(r.pnlEma * 2);
  return Math.round(100 * (0.5 * completion + 0.25 * rehire + 0.25 * pnl));
}

export function breakdown(r: RepStats) {
  const completion = r.outcomes.length ? r.outcomes.reduce((a, b) => a + b, 0) / r.outcomes.length : 0.5;
  const rehire = r.jobs ? r.rehires / r.jobs : 0;
  const pnl = 0.5 + 0.5 * Math.tanh(r.pnlEma * 2);
  return { completion, rehire, pnl };
}
