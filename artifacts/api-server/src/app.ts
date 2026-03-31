import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
