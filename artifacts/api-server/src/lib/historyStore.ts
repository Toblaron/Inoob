/**
 * Server-side template history store.
 * Reuses the single shared SQLite connection from cache.ts.
 * Each entry stores a full generated template + the source YouTube URL + optional rating.
 */
import { createHash } from "crypto";
import { db } from "./cache.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS template_history (
    id          TEXT PRIMARY KEY,
    created_at  INTEGER NOT NULL,
    youtube_url TEXT NOT NULL,
    song_title  TEXT,
    artist      TEXT,
    thumbnail   TEXT,
    template    TEXT NOT NULL,
    rating      INTEGER,
    quality_score REAL,
    used_options TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_history_created ON template_history (created_at DESC);

  CREATE TABLE IF NOT EXISTS shared_templates (
    hash        TEXT PRIMARY KEY,
    created_at  INTEGER NOT NULL,
    youtube_url TEXT,
    template    TEXT NOT NULL
  );
`);

export interface HistoryEntry {
  id: string;
  createdAt: number;
  youtubeUrl: string;
  songTitle?: string;
  artist?: string;
  thumbnail?: string;
  template: unknown;
  rating?: number | null;
  qualityScore?: number | null;
  usedOptions?: unknown;
}

const insertStmt = db.prepare<[string, number, string, string | null, string | null, string | null, string, number | null, number | null, string | null]>(`
  INSERT OR REPLACE INTO template_history
    (id, created_at, youtube_url, song_title, artist, thumbnail, template, rating, quality_score, used_options)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listStmt = db.prepare<[number]>(`
  SELECT * FROM template_history ORDER BY created_at DESC LIMIT ?
`);

const updateRatingStmt = db.prepare<[number | null, string]>(`
  UPDATE template_history SET rating = ? WHERE id = ?
`);

const deleteStmt = db.prepare<[string]>(`DELETE FROM template_history WHERE id = ?`);
const clearStmt = db.prepare<[]>(`DELETE FROM template_history`);

const insertShareStmt = db.prepare<[string, number, string | null, string]>(`
  INSERT OR REPLACE INTO shared_templates (hash, created_at, youtube_url, template)
  VALUES (?, ?, ?, ?)
`);

const getShareStmt = db.prepare<[string]>(`SELECT * FROM shared_templates WHERE hash = ?`);

// Purge shared links older than 90 days to prevent unbounded table growth
const SHARE_TTL_MS = 90 * 24 * 3600 * 1000;
const purgeSharesStmt = db.prepare<[number]>(`DELETE FROM shared_templates WHERE created_at < ?`);
setInterval(() => {
  try { purgeSharesStmt.run(Date.now() - SHARE_TTL_MS); } catch { /* non-critical */ }
}, 6 * 3600 * 1000).unref(); // every 6 hours
// Also run once at startup
try { purgeSharesStmt.run(Date.now() - SHARE_TTL_MS); } catch { /* non-critical */ }

export function saveEntry(entry: HistoryEntry): void {
  insertStmt.run(
    entry.id,
    entry.createdAt,
    entry.youtubeUrl,
    entry.songTitle ?? null,
    entry.artist ?? null,
    entry.thumbnail ?? null,
    JSON.stringify(entry.template),
    entry.rating ?? null,
    entry.qualityScore ?? null,
    entry.usedOptions ? JSON.stringify(entry.usedOptions) : null,
  );
}

interface RawRow {
  id: string;
  created_at: number;
  youtube_url: string;
  song_title: string | null;
  artist: string | null;
  thumbnail: string | null;
  template: string;
  rating: number | null;
  quality_score: number | null;
  used_options: string | null;
}

function rowToEntry(row: RawRow): HistoryEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    youtubeUrl: row.youtube_url,
    songTitle: row.song_title ?? undefined,
    artist: row.artist ?? undefined,
    thumbnail: row.thumbnail ?? undefined,
    template: JSON.parse(row.template) as unknown,
    rating: row.rating ?? null,
    qualityScore: row.quality_score ?? null,
    usedOptions: row.used_options ? JSON.parse(row.used_options) as unknown : undefined,
  };
}

export function listEntries(limit = 50): HistoryEntry[] {
  const rows = listStmt.all(limit) as RawRow[];
  return rows.map(rowToEntry);
}

export function updateRating(id: string, rating: number | null): void {
  updateRatingStmt.run(rating, id);
}

export function deleteEntry(id: string): void {
  deleteStmt.run(id);
}

export function clearHistory(): void {
  clearStmt.run();
}

// ── Short links ──────────────────────────────────────────────────────────────

export function saveShareLink(youtubeUrl: string | null, template: unknown): string {
  const payload = JSON.stringify({ youtubeUrl, template });
  const hash = createHash("sha1").update(payload).digest("hex").slice(0, 8);
  insertShareStmt.run(hash, Date.now(), youtubeUrl, payload);
  return hash;
}

interface ShareRow {
  hash: string;
  created_at: number;
  youtube_url: string | null;
  template: string;
}

export function getShareLink(hash: string): { youtubeUrl: string | null; template: unknown } | null {
  const row = getShareStmt.get(hash) as ShareRow | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.template) as { youtubeUrl?: string; template?: unknown };
    return { youtubeUrl: parsed.youtubeUrl ?? null, template: parsed.template };
  } catch {
    return null;
  }
}
