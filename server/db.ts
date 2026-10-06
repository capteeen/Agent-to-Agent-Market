// SQLite persistence for the Phase 2 engine. Uses Node's built-in sqlite so
// there is no native dependency to build. Everything is stored as JSON blobs
// keyed by id; the engine keeps the hot state in memory and writes through.

// resolved at runtime so bundlers/test runners that predate node:sqlite don't try to resolve it
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = import("node:sqlite").DatabaseSync;
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Agent, AgentHistory, Job, MarketEvent, MarketReport, MarketStats } from "../lib/types";
import type { RepStats } from "../lib/reputation";

export class Db {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS agents  (id TEXT PRIMARY KEY, json TEXT NOT NULL, born_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS secrets (id TEXT PRIMARY KEY, enc TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs    (id TEXT PRIMARY KEY, json TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events  (id TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rep     (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (hour INTEGER PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS kv      (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS nonces  (nonce TEXT PRIMARY KEY, wallet TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS txlog   (sig TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS jobs_created ON jobs(created_at);
      CREATE INDEX IF NOT EXISTS events_at ON events(at);
    `);
  }

  // ── generic helpers
  private all<T>(sql: string, ...args: (string | number)[]): T[] {
    return this.db.prepare(sql).all(...args) as T[];
  }
  private run(sql: string, ...args: (string | number | null)[]) {
    this.db.prepare(sql).run(...args);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  // ── kv
  get(k: string): string | undefined {
    return this.all<{ v: string }>("SELECT v FROM kv WHERE k = ?", k)[0]?.v;
  }
  set(k: string, v: string) {
    this.run("INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, v);
  }
  getJson<T>(k: string): T | undefined {
    const v = this.get(k);
    return v === undefined ? undefined : (JSON.parse(v) as T);
  }
  setJson(k: string, v: unknown) {
    this.set(k, JSON.stringify(v));
  }

  // ── agents
  agents(): Agent[] {
    return this.all<{ json: string }>("SELECT json FROM agents ORDER BY born_at").map((r) => JSON.parse(r.json));
  }
  putAgent(a: Agent) {
    this.run("INSERT INTO agents(id, json, born_at) VALUES(?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json", a.id, JSON.stringify(a), a.bornAt);
  }

  // ── secrets (encrypted keypairs)
  secret(id: string): string | undefined {
    return this.all<{ enc: string }>("SELECT enc FROM secrets WHERE id = ?", id)[0]?.enc;
  }
  putSecret(id: string, enc: string) {
    this.run("INSERT INTO secrets(id, enc) VALUES(?, ?) ON CONFLICT(id) DO NOTHING", id, enc);
  }

  // ── jobs
  jobs(limit = 500): Job[] {
    return this.all<{ json: string }>("SELECT json FROM jobs ORDER BY created_at DESC LIMIT ?", limit).map((r) => JSON.parse(r.json));
  }
  liveJobs(): Job[] {
    return this.all<{ json: string }>("SELECT json FROM jobs WHERE status IN ('open','accepted') ORDER BY created_at").map((r) => JSON.parse(r.json));
  }
  putJob(j: Job) {
    this.run(
      "INSERT INTO jobs(id, json, created_at, status) VALUES(?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, status = excluded.status",
      j.id,
      JSON.stringify(j),
      j.createdAt,
      j.status,
    );
  }
  countJobs(status: string, since: number): number {
    return this.all<{ n: number }>("SELECT COUNT(*) AS n FROM jobs WHERE status = ? AND created_at >= ?", status, since)[0].n;
  }

  // ── events
  events(limit = 400): MarketEvent[] {
    return this.all<{ json: string }>("SELECT json FROM events ORDER BY at DESC LIMIT ?", limit).map((r) => JSON.parse(r.json));
  }
  putEvent(e: MarketEvent) {
    this.run("INSERT INTO events(id, json, at) VALUES(?, ?, ?)", e.id, JSON.stringify(e), e.at);
  }
  pruneEvents(keep = 5000) {
    this.run("DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY at DESC LIMIT ?)", keep);
  }

  // ── history / rep / reports
  histories(): Record<string, AgentHistory> {
    const out: Record<string, AgentHistory> = {};
    for (const r of this.all<{ id: string; json: string }>("SELECT id, json FROM history")) out[r.id] = JSON.parse(r.json);
    return out;
  }
  putHistory(id: string, h: AgentHistory) {
    this.run("INSERT INTO history(id, json) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json", id, JSON.stringify(h));
  }
  reps(): Record<string, RepStats> {
    const out: Record<string, RepStats> = {};
    for (const r of this.all<{ id: string; json: string }>("SELECT id, json FROM rep")) out[r.id] = JSON.parse(r.json);
    return out;
  }
  putRep(id: string, r: RepStats) {
    this.run("INSERT INTO rep(id, json) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json", id, JSON.stringify(r));
  }
  reports(limit = 24): MarketReport[] {
    return this.all<{ json: string }>("SELECT json FROM reports ORDER BY hour DESC LIMIT ?", limit).map((r) => JSON.parse(r.json));
  }
  putReport(r: MarketReport) {
    this.run("INSERT INTO reports(hour, json) VALUES(?, ?) ON CONFLICT(hour) DO UPDATE SET json = excluded.json", r.hour, JSON.stringify(r));
  }
  stats(): MarketStats {
    return this.getJson<MarketStats>("stats") ?? { agentsAlive: 0, jobsCompleted: 0, solMoved: 0, feesEarned: 0 };
  }
  putStats(s: MarketStats) {
    this.setJson("stats", s);
  }

  // ── nonces (owner auth)
  issueNonce(wallet: string, nonce: string, ttlMs: number) {
    this.run("INSERT INTO nonces(nonce, wallet, expires) VALUES(?, ?, ?)", nonce, wallet, Date.now() + ttlMs);
    this.run("DELETE FROM nonces WHERE expires < ?", Date.now());
  }
  /** Consume a nonce; true if it was valid, unused and belongs to the wallet. */
  useNonce(wallet: string, nonce: string): boolean {
    const row = this.all<{ wallet: string; expires: number; used: number }>("SELECT wallet, expires, used FROM nonces WHERE nonce = ?", nonce)[0];
    if (!row || row.wallet !== wallet || row.used || row.expires < Date.now()) return false;
    this.run("UPDATE nonces SET used = 1 WHERE nonce = ?", nonce);
    return true;
  }

  // ── on-chain tx log (idempotency for funding)
  seenTx(sig: string): boolean {
    return this.all<{ n: number }>("SELECT COUNT(*) AS n FROM txlog WHERE sig = ?", sig)[0].n > 0;
  }
  tx<T = unknown>(sig: string): T | undefined {
    const r = this.all<{ json: string }>("SELECT json FROM txlog WHERE sig = ?", sig)[0];
    return r ? (JSON.parse(r.json) as T) : undefined;
  }
  logTx(sig: string, info: unknown) {
    this.run("INSERT INTO txlog(sig, json, at) VALUES(?, ?, ?) ON CONFLICT(sig) DO NOTHING", sig, JSON.stringify(info), Date.now());
  }

  close() {
    this.db.close();
  }
}
