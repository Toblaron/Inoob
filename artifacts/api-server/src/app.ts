import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import router from "./routes";

const app: Express = express();

// ── In-memory sliding-window rate limiter ────────────────────────────────────
// Keyed by IP. Limits heavy generation endpoints separately from lightweight ones.
interface WindowEntry { count: number; resetAt: number }
const rateLimitWindows = new Map<string, WindowEntry>();

// Clean up stale entries every 5 minutes to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitWindows) {
    if (entry.resetAt < now) rateLimitWindows.delete(key);
  }
}, 5 * 60 * 1000).unref();

function makeRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = (req.headers["x-forwarded-for"] as string ?? req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const entry = rateLimitWindows.get(key);

    if (!entry || entry.resetAt < now) {
      rateLimitWindows.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: `Too many requests — please wait ${retryAfter}s before trying again.` });
      return;
    }
    entry.count++;
    next();
  };
}

// AI generation endpoints: 20 requests / 2 minutes per IP
const heavyLimiter = makeRateLimiter(20, 2 * 60 * 1000);
// All other API endpoints: 120 requests / minute per IP
const lightLimiter = makeRateLimiter(120, 60 * 1000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Apply rate limiters to API routes
app.use("/api/generate-template", heavyLimiter);
app.use("/api/generate-variations", heavyLimiter);
app.use("/api/batch", heavyLimiter);
app.use("/api/suno/transform", heavyLimiter);
app.use("/api", lightLimiter);

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  // import.meta.url is undefined in esbuild CJS bundles — fall back to cwd-relative path
  let serverDir: string;
  try {
    serverDir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    serverDir = path.join(process.cwd(), "artifacts", "api-server", "dist");
  }
  const staticDir = process.env.STATIC_DIR
    ? path.resolve(process.env.STATIC_DIR)
    : path.resolve(serverDir, "../../suno-generator/dist/public");

  if (existsSync(staticDir)) {
    console.log(`Serving static frontend from: ${staticDir}`);
    app.use(express.static(staticDir));
    app.get("*path", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  } else {
    console.warn(`Static dir not found: ${staticDir} — frontend will not be served.`);
  }
}

export default app;
