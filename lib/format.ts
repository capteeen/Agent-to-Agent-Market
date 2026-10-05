export const sol = (n: number, d = 3) => `${n.toFixed(d)} SOL`;
export const num = (n: number, d = 3) => n.toFixed(d);

export const short = (s: string, n = 4) => (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function age(ts: number, now = Date.now()): string {
  const m = Math.floor((now - ts) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const SERVICE_LABEL = { pick: "PICK", attention: "ATTENTION", launch: "LAUNCH" } as const;
export const TYPE_COLOR = { launcher: "#ff6b35", scout: "#5be37d", shiller: "#b07cff" } as const;
