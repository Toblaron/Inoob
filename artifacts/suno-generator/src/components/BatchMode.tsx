import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle, XCircle, Download, Play, Plus, Trash2, Layers, X } from "lucide-react";
import { batchGenerateTemplates, type BatchResult, type BatchOptions } from "@/lib/manual-api";
import type { SunoTemplate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface BatchModeProps {
  defaultOptions?: BatchOptions;
  onTemplateSelect?: (template: SunoTemplate) => void;
  onClose: () => void;
  className?: string;
}

interface UrlEntry {
  id: string;
  url: string;
  label?: string;
}

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) &&
      (u.pathname.includes("/watch") || u.hostname === "youtu.be" || u.pathname.includes("/shorts/"));
  } catch { return false; }
}

function downloadAllAsTxt(results: BatchResult[]) {
  const successful = results.filter((r) => r.template);
  if (successful.length === 0) return;

  const content = successful.map((r) => {
    const t = r.template!;
    return [
      `${"=".repeat(70)}`,
      `${t.songTitle} — ${t.artist}`,
      `YouTube: ${r.url}`,
      `${"=".repeat(70)}`,
      "",
      "STYLE OF MUSIC",
      "-".repeat(40),
      t.styleOfMusic,
      "",
      "TITLE",
      "-".repeat(40),
      t.title,
      "",
      "LYRICS / METADATA",
      "-".repeat(40),
      t.lyrics,
      "",
      "NEGATIVE PROMPT",
      "-".repeat(40),
      t.negativePrompt,
      "",
    ].join("\n");
  }).join("\n\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `suno-batch-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BatchMode({ defaultOptions = {}, onTemplateSelect, onClose, className }: BatchModeProps) {
  const [urls, setUrls] = useState<UrlEntry[]>([{ id: "1", url: "" }]);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const abortRef = useRef<boolean>(false);

  const addUrl = () => setUrls((prev) => [...prev, { id: Date.now().toString(), url: "" }]);
  const removeUrl = (id: string) => setUrls((prev) => prev.filter((u) => u.id !== id));
  const updateUrl = (id: string, url: string) =>
    setUrls((prev) => prev.map((u) => u.id === id ? { ...u, url: url.trim() } : u));

  const handlePasteMultiple = () => {
    navigator.clipboard.readText().then((text) => {
      const lines = text.split(/[\n,]/).map((l) => l.trim()).filter((l) => isYouTubeUrl(l));
      if (lines.length === 0) {
        setPasteError("No YouTube URLs found in clipboard. Copy one or more YouTube URLs first.");
        setTimeout(() => setPasteError(null), 4000);
        return;
      }
      const newEntries = lines.slice(0, 10).map((url, i) => ({ id: `paste-${i}`, url }));
      setUrls(newEntries);
    }).catch(() => {
      setPasteError("Could not read clipboard. Paste URLs manually.");
      setTimeout(() => setPasteError(null), 3000);
    });
  };

  const validUrls = urls.map((u) => u.url).filter(isYouTubeUrl);

  const handleGenerate = async () => {
    if (validUrls.length === 0) return;
    abortRef.current = false;
    setIsProcessing(true);
    setResults([]);
    setProgress(0);

    try {
      const res = await batchGenerateTemplates(validUrls, defaultOptions);
      setResults(res);
      setProgress(100);
    } catch (err) {
      setResults(validUrls.map((url) => ({ url, template: null, error: (err as Error).message })));
    } finally {
      setIsProcessing(false);
    }
  };

  const successCount = results.filter((r) => r.template).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className={cn("bg-card border border-primary/25 overflow-hidden", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-primary/10">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary/60" />
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">Batch Mode</span>
          <span className="font-mono text-[10px] text-zinc-600">Process up to 10 URLs at once</span>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* URL inputs */}
        <div className="space-y-2">
          {urls.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <div className={cn(
                "flex-1 flex items-center border overflow-hidden transition-all",
                isYouTubeUrl(entry.url) ? "border-green-500/30" : entry.url ? "border-red-500/30" : "border-primary/20"
              )}>
                <div className="pl-3 pr-2">
                  {isYouTubeUrl(entry.url)
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    : <span className="w-3.5 h-3.5 flex items-center justify-center text-zinc-700 font-mono text-xs">#</span>
                  }
                </div>
                <input
                  type="url"
                  value={entry.url}
                  onChange={(e) => updateUrl(entry.id, e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full py-2 pr-3 bg-transparent border-none text-foreground placeholder:text-zinc-700 focus:outline-none text-xs font-mono"
                  disabled={isProcessing}
                />
              </div>
              {urls.length > 1 && (
                <button
                  onClick={() => removeUrl(entry.id)}
                  disabled={isProcessing}
                  className="p-1.5 text-zinc-700 hover:text-zinc-400 transition-colors disabled:opacity-30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}

          {pasteError && (
            <p className="font-mono text-[10px] text-red-400">{pasteError}</p>
          )}

          <div className="flex gap-2">
            {urls.length < 10 && (
              <button
                onClick={addUrl}
                disabled={isProcessing}
                className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-30"
              >
                <Plus className="w-3 h-3" /> Add URL
              </button>
            )}
            <button
              onClick={handlePasteMultiple}
              disabled={isProcessing}
              className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors ml-auto disabled:opacity-30"
            >
              Paste multiple from clipboard
            </button>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isProcessing || validUrls.length === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-primary bg-primary text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isProcessing
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing {validUrls.length} URLs...</>
            : <><Play className="w-3.5 h-3.5" /> Generate {validUrls.length} Template{validUrls.length !== 1 ? "s" : ""}</>
          }
        </button>

        {/* Progress bar */}
        {isProcessing && (
          <div className="w-full h-0.5 bg-zinc-900">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}

        {/* Results */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                  {successCount}/{results.length} generated
                </span>
                {successCount > 0 && (
                  <button
                    onClick={() => downloadAllAsTxt(results)}
                    className="flex items-center gap-1.5 font-mono text-[10px] text-primary hover:text-primary/80 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download All (.txt)
                  </button>
                )}
              </div>

              {results.map((result, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 border",
                    result.template ? "border-green-500/20 bg-green-500/3" : "border-red-500/20 bg-red-500/3"
                  )}
                >
                  {result.template
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    {result.template ? (
                      <>
                        <p className="font-mono text-xs font-bold text-foreground truncate">{result.template.songTitle}</p>
                        <p className="font-mono text-[10px] text-zinc-500 truncate">{result.template.artist}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-mono text-[10px] text-red-400 truncate">{result.error ?? "Failed"}</p>
                        <p className="font-mono text-[9px] text-zinc-600 truncate">{result.url}</p>
                      </>
                    )}
                  </div>
                  {result.template && onTemplateSelect && (
                    <button
                      onClick={() => { onTemplateSelect(result.template!); onClose(); }}
                      className="shrink-0 font-mono text-[10px] px-2 py-1 border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                    >
                      View
                    </button>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
