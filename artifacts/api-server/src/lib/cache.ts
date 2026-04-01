import Database from "better-sqlite3";
import { createHash } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const CACHE_DIR = process.env.CACHE_DIR ?? "./data";
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const DB_PATH = join(CACHE_DIR, "suno-cache.db");

export const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_expires ON cache (expires_at);
`);

const cleanup = db.prepare<[number]>(`DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at < ?`);

interface StmtRow {
  value: string;
  expires_at: number | null;
}

const getStmt = db.prepare<[string]>(`SELECT value, expires_at FROM cache WHERE key = ?`);
const setStmt = db.prepare<[string, string, number | null]>(`INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)`);
const delStmt = db.prepare<[string]>(`DELETE FROM cache WHERE key = ?`);
const countStmt = db.prepare<[number]>(`SELECT COUNT(*) as cnt FROM cache WHERE expires_at IS NULL OR expires_at >= ?`);
const sizeStmt = db.prepare<[]>(`SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`);

let hits = 0;
let misses = 0;

export function cacheGet<T>(key: string): T | null {
  const now = Date.now();
  const row = getStmt.get(key) as StmtRow | undefined;
  if (!row) { misses++; return null; }
  if (row.expires_at !== null && row.expires_at < now) {
    delStmt.run(key);
    misses++;
    return null;
  }
  hits++;
  return JSON.parse(row.value) as T;
}

export function cacheSet<T>(key: string, value: T, ttlSeconds?: number): void {
  const expiresAt = ttlSeconds != null ? Date.now() + ttlSeconds * 1000 : null;
  setStmt.run(key, JSON.stringify(value), expiresAt);
}

export function cacheDel(key: string): void {
  delStmt.run(key);
}

export function cacheStats(): { entries: number; sizeBytes: number; hits: number; misses: number; hitRate: string } {
  const now = Date.now();
  cleanup.run(now);
  const countRow = countStmt.get(now) as { cnt: number };
  const sizeRow = sizeStmt.get() as { size: number };
  const total = hits + misses;
  const hitRate = total > 0 ? `${((hits / total) * 100).toFixed(1)}%` : "n/a";
  return { entries: countRow.cnt, sizeBytes: sizeRow.size, hits, misses, hitRate };
}

/**
 * Recursively JSON-stringify with all object keys sorted, so nested objects
 * always produce the same output regardless of insertion order.
 */
function stableStringify(val: unknown): string {
  if (val === null || typeof val !== "object") return JSON.stringify(val);
  if (Array.isArray(val)) return `[${val.map(stableStringify).join(",")}]`;
  const obj = val as Record<string, unknown>;
  const sorted = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${sorted.join(",")}}`;
}

/**
 * Create a deterministic cache key from a set of parameters.
 * Uses a deep stable-sort stringify so nested objects (e.g. confirmedStructure)
 * always hash consistently regardless of key insertion order.
 * SHA-1 (first 12 chars) — collisions are harmless (just a cache miss).
 */
export function hashParams(params: Record<string, unknown>): string {
  return createHash("sha1").update(stableStringify(params)).digest("hex").slice(0, 12);
}

/** TTL constants (seconds). undefined = permanent (no expiry). */
export const TTL = {
  /** Base video metadata + lyrics — re-fetch after 7 days in case lyrics are updated */
  METADATA: 7 * 24 * 3600,
  LYRICS: 7 * 24 * 3600,
  /** Audio features are deterministic — never expire */
  FEATURES: undefined as number | undefined,
  /** Generated AI template output — re-generate after 7 days */
  TEMPLATE: 7 * 24 * 3600,
} as const;
