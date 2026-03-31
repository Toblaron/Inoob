import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

// import.meta.url is undefined in esbuild CJS bundles (production build).
// Fall back to a path relative to CWD which is the repo root on the Pi.
const SCRIPT = (() => {
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../validate_chars.py");
  } catch {
    return path.resolve(process.cwd(), "artifacts/api-server/src/validate_chars.py");
  }
})();

export interface FieldReport {
  original: number;
  final: number;
  min: number;
  max: number;
  ok: boolean;
}

export interface ValidationReport {
  valid: boolean;
  trimmed: boolean;
  fields: {
    styleOfMusic?: FieldReport;
    lyrics?: FieldReport;
    negativePrompt?: FieldReport;
  };
  errors: string[];
  /** Trimmed/validated field values — use these instead of the raw AI output */
  data: {
    styleOfMusic: string;
    lyrics: string;
    negativePrompt: string;
  };
}

/**
 * Run the Python character-count validator and trimmer.
 *
 * Python len() counts Unicode code points — more accurate than JS .length
 * for text containing emoji or supplementary-plane characters.
 *
 * The script also trims fields that exceed the max limit (smart trim at
 * newline for lyrics, comma for style/negative).
 *
 * Returns null if Python is not available (graceful degradation).
 */
export async function validateWithPython(payload: {
  styleOfMusic: string;
  lyrics: string;
  negativePrompt: string;
}): Promise<ValidationReport | null> {
  return new Promise((resolve) => {
    const py = spawn("python3", [SCRIPT], { timeout: 15_000 });

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (chunk) => (stdout += chunk));
    py.stderr.on("data", (chunk) => (stderr += chunk));

    py.on("error", (err) => {
      console.warn(`[py-validate] spawn error: ${err.message} — skipping`);
      resolve(null);
    });

    py.on("close", (code) => {
      if (code !== 0) {
        console.warn(`[py-validate] exit ${code}: ${stderr.trim()}`);
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ValidationReport);
      } catch {
        console.warn(`[py-validate] JSON parse error: ${stdout.slice(0, 200)}`);
        resolve(null);
      }
    });

    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();
  });
}
