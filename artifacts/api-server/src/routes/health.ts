import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { cacheStats } from "../lib/cache.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/** Operational endpoint — returns cache metrics for monitoring. */
router.get("/cache-stats", (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (adminKey && req.query.key !== adminKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(cacheStats());
});

export default router;
