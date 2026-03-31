import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, "../validate_chars.py");

export interface FieldReport {
  len: number;
  min: number;
  max: number;
  ok: boolean;
}

export interface ValidationReport {
  valid: boolean;
  fields: {
    styleOfMusic?: FieldReport;
    lyrics?: FieldReport;
    negativePrompt?: FieldReport;
  };
  errors: string[];
}

/**
 * Run the Python character-count validator.
 * Python len() counts Unicode code points — more accurate than JS .length
 * for text containing emoji or supplementary-plane characters.
 *
 * Returns null if Python is not available (graceful degradation).
 */
export async function validateWithPython(payload: {
  styleOfMusic: string;
  lyrics: string;
  negativePrompt: string;
}): Promise<ValidationReport | null> {
  return new Promise((resolve) => {
    const py = spawn("python3", [SCRIPT], { timeout: 10_000 });

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
