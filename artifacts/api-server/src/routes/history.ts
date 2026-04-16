import { Router, type IRouter } from "express";
import {
  saveEntry,
  listEntries,
  updateRating,
  deleteEntry,
  clearHistory,
  saveShareLink,
  getShareLink,
  type HistoryEntry,
} from "../lib/historyStore.js";

const router: IRouter = Router();

/**
 * GET /api/history?limit=50
 * Returns the most recent history entries (default 50, max 200).
 */
router.get("/history", (req, res) => {
  const rawLimit = parseInt(String(req.query.limit ?? "50"), 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
  try {
    const entries = listEntries(limit);
    res.json({ entries });
  } catch (err) {
    console.error("[history] list error:", err);
    res.status(500).json({ error: "Failed to load history" });
  }
});

/**
 * POST /api/history
 * Save a new history entry.
 * Body: { id, createdAt, youtubeUrl, songTitle?, artist?, thumbnail?, template, rating?, qualityScore?, usedOptions? }
 */
router.post("/history", (req, res) => {
  const body = req.body as Partial<HistoryEntry>;
  if (!body.id || !body.youtubeUrl || !body.template) {
    res.status(400).json({ error: "Missing required fields: id, youtubeUrl, template" });
    return;
  }
  try {
    saveEntry({
      id: String(body.id),
      createdAt: typeof body.createdAt === "number" ? body.createdAt : Date.now(),
      youtubeUrl: String(body.youtubeUrl),
      songTitle: body.songTitle,
      artist: body.artist,
      thumbnail: body.thumbnail,
      template: body.template,
      rating: body.rating ?? null,
      qualityScore: body.qualityScore ?? null,
      usedOptions: body.usedOptions,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[history] save error:", err);
    res.status(500).json({ error: "Failed to save history entry" });
  }
});

/**
 * PATCH /api/history/:id/rating
 * Update the rating for a history entry.
 * Body: { rating: number | null }
 */
router.patch("/history/:id/rating", (req, res) => {
  const { id } = req.params;
  const { rating } = req.body as { rating?: number | null };
  if (rating !== null && rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 5)) {
    res.status(400).json({ error: "rating must be 1–5 or null" });
    return;
  }
  try {
    updateRating(id, rating ?? null);
    res.json({ ok: true });
  } catch (err) {
    console.error("[history] rating error:", err);
    res.status(500).json({ error: "Failed to update rating" });
  }
});

/**
 * DELETE /api/history/:id
 * Delete a single history entry.
 */
router.delete("/history/:id", (req, res) => {
  try {
    deleteEntry(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[history] delete error:", err);
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

/**
 * DELETE /api/history
 * Clear all history entries.
 */
router.delete("/history", (_req, res) => {
  try {
    clearHistory();
    res.json({ ok: true });
  } catch (err) {
    console.error("[history] clear error:", err);
    res.status(500).json({ error: "Failed to clear history" });
  }
});

/**
 * POST /api/share
 * Store a template and return a short hash that can be used to retrieve it.
 * Body: { youtubeUrl?: string, template: object }
 * Response: { hash: string, url: string }
 */
router.post("/share", (req, res) => {
  const { youtubeUrl, template } = req.body as { youtubeUrl?: string; template?: unknown };
  if (!template || typeof template !== "object") {
    res.status(400).json({ error: "Missing required field: template" });
    return;
  }
  try {
    const hash = saveShareLink(youtubeUrl ?? null, template);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({ hash, url: `${baseUrl}/#share=${hash}` });
  } catch (err) {
    console.error("[share] save error:", err);
    res.status(500).json({ error: "Failed to create share link" });
  }
});

/**
 * GET /api/share/:hash
 * Retrieve a shared template by its short hash.
 * Response: { youtubeUrl: string | null, template: object }
 */
router.get("/share/:hash", (req, res) => {
  const { hash } = req.params;
  if (!/^[0-9a-f]{8}$/.test(hash)) {
    res.status(400).json({ error: "Invalid share hash" });
    return;
  }
  try {
    const result = getShareLink(hash);
    if (!result) {
      res.status(404).json({ error: "Share link not found or expired" });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("[share] get error:", err);
    res.status(500).json({ error: "Failed to retrieve share link" });
  }
});

export default router;
