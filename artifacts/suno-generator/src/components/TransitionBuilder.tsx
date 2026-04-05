import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Check,
  Music2,
  Mic2,
} from "lucide-react";
import type { SunoTemplate } from "@workspace/api-client-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

type TransitionStyle = "smooth" | "key-change" | "genre-blend" | "breakdown";

interface SongInfo {
  title: string;
  artist: string;
  template: SunoTemplate;
}

interface TransitionResponse {
  from: SongInfo;
  to: SongInfo;
  transition: SunoTemplate;
  style: TransitionStyle;
}

const STYLE_OPTIONS: { id: TransitionStyle; label: string; description: string }[] = [
  { id: "smooth", label: "Smooth Blend", description: "Gradual crossfade with overlapping textures" },
  { id: "key-change", label: "Key Change", description: "Dramatic harmonic pivot and modulation" },
  { id: "genre-blend", label: "Genre Fusion", description: "Hybrid between both songs' styles" },
  { id: "breakdown", label: "Breakdown Drop", description: "Stripped minimal section then energy rise" },
];

function isValidYouTubeUrl(url: string): boolean {
  return url.includes("youtube.com/watch") || url.includes("youtu.be/");
}

function SongCard({ info, side }: { info: SongInfo; side: "from" | "to" }) {
  return (
    <div className={cn(
      "flex-1 px-3 py-2.5 border",
      side === "from" ? "border-primary/20" : "border-secondary/20"
    )}>
      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">
        {side === "from" ? "Song A" : "Song B"}
      </span>
      <div className="flex items-center gap-1.5">
        <Music2 className="w-3.5 h-3.5 text-primary/50 shrink-0" />
        <span className="font-mono text-[11px] text-zinc-200 font-medium truncate">{info.title}</span>
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <Mic2 className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
        <span className="font-mono text-[10px] text-zinc-500 truncate">{info.artist}</span>
      </div>
    </div>
  );
}

interface TransitionBuilderProps {
  className?: string;
}

export function TransitionBuilder({ className }: TransitionBuilderProps) {
  const [expanded, setExpanded] = useState(false);
  const [fromUrl, setFromUrl] = useState("");
  const [toUrl, setToUrl] = useState("");
  const [style, setStyle] = useState<TransitionStyle>("smooth");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransitionResponse | null>(null);
  const [resultExpanded, setResultExpanded] = useState(true);
  const { copy } = useCopyToClipboard();

  const apiBase = (import.meta as unknown as { env: Record<string, string> }).env.BASE_URL?.replace(/\/$/, "") ?? "";

  const fromValid = isValidYouTubeUrl(fromUrl);
  const toValid = isValidYouTubeUrl(toUrl);
  const canGenerate = fromValid && toValid && !loading;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`${apiBase}/api/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUrl, toUrl, style }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Transition generation failed");
      }
      const data = await resp.json() as TransitionResponse;
      setResult(data);
      setResultExpanded(true);
    } catch (err) {
      setError((err as Error).message ?? "Transition generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!result) return;
    const t = result.transition;
    const text = [
      `TRANSITION TEMPLATE`,
      `${result.from.title} → ${result.to.title}`,
      `Style: ${style}`,
      "",
      "=".repeat(50),
      "STYLE OF MUSIC",
      "=".repeat(50),
      t.styleOfMusic,
      "",
      "=".repeat(50),
      "TITLE",
      "=".repeat(50),
      t.title,
      "",
      "=".repeat(50),
      "LYRICS / METADATA",
      "=".repeat(50),
      t.lyrics,
      "",
      "=".repeat(50),
      "NEGATIVE PROMPT",
      "=".repeat(50),
      t.negativePrompt,
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Transition - ${result.from.title} to ${result.to.title}.txt`.replace(/[/\\?%*:|"<>]/g, "");
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("w-full bg-card border border-primary/15 overflow-hidden", className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left hover:bg-primary/3 transition-colors"
      >
        <ArrowRight className="w-4 h-4 text-primary/60 shrink-0" />
        <div className="flex-1">
          <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">Transition Builder</span>
          <span className="font-mono text-[11px] text-zinc-400 leading-tight">
            Generate a bridge template between two songs
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="border-t border-primary/10 p-4 space-y-4">
              {/* URL inputs */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 bg-primary/20 text-primary font-bold text-[8px]">A</span>
                    Song A — From URL
                  </label>
                  <div className="relative">
                    <input
                      value={fromUrl}
                      onChange={(e) => setFromUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className={cn(
                        "w-full bg-zinc-900/60 border px-3 py-2 font-mono text-[11px] text-zinc-300 focus:outline-none transition-colors",
                        fromUrl && !fromValid ? "border-red-500/40 focus:border-red-500/60" :
                        fromValid ? "border-green-500/30 focus:border-green-500/50" :
                        "border-primary/15 focus:border-primary/40"
                      )}
                    />
                    {fromValid && (
                      <Check className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-400" />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-primary/10" />
                  <ArrowRight className="w-4 h-4 text-primary/30 shrink-0" />
                  <div className="flex-1 h-px bg-primary/10" />
                </div>

                <div className="space-y-1.5">
                  <label className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 bg-secondary/20 text-secondary font-bold text-[8px]">B</span>
                    Song B — To URL
                  </label>
                  <div className="relative">
                    <input
                      value={toUrl}
                      onChange={(e) => setToUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className={cn(
                        "w-full bg-zinc-900/60 border px-3 py-2 font-mono text-[11px] text-zinc-300 focus:outline-none transition-colors",
                        toUrl && !toValid ? "border-red-500/40 focus:border-red-500/60" :
                        toValid ? "border-green-500/30 focus:border-green-500/50" :
                        "border-primary/15 focus:border-primary/40"
                      )}
                    />
                    {toValid && (
                      <Check className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Transition style */}
              <div className="space-y-2">
                <label className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Transition Style</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {STYLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setStyle(opt.id)}
                      className={cn(
                        "text-left px-3 py-2 border font-mono transition-all",
                        style === opt.id
                          ? "border-primary/50 bg-primary/8 text-primary"
                          : "border-zinc-800/60 text-zinc-500 hover:border-primary/25 hover:text-zinc-300"
                      )}
                    >
                      <span className="text-[11px] font-semibold block">{opt.label}</span>
                      <span className="text-[9px] text-zinc-600 leading-tight block mt-0.5">{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/5 border border-red-500/20">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="font-mono text-[11px] text-red-400">{error}</span>
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center gap-2.5 py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="font-mono text-[11px] text-primary/60">Analyzing both songs and generating bridge...</span>
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-2.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
                  !canGenerate
                    ? "border-zinc-700/50 text-zinc-600 cursor-not-allowed"
                    : "border-primary bg-primary text-black hover:bg-primary/90"
                )}
              >
                {loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                ) : (
                  <><ArrowRight className="w-3.5 h-3.5" /> Generate Transition</>
                )}
              </button>

              {/* Result */}
              {result && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 border-t border-primary/10 pt-4"
                >
                  {/* Song A → Song B cards */}
                  <div className="flex items-center gap-2">
                    <SongCard info={result.from} side="from" />
                    <ArrowRight className="w-4 h-4 text-primary/40 shrink-0" />
                    <SongCard info={result.to} side="to" />
                  </div>

                  {/* Transition template */}
                  <div className="border border-primary/25 bg-primary/3 overflow-hidden">
                    <button
                      onClick={() => setResultExpanded((v) => !v)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-primary/4"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-[10px] text-primary/50 uppercase tracking-wider block">Transition Template</span>
                        <span className="font-mono text-[11px] text-zinc-200 truncate block">{result.transition.title}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copy(result.transition.styleOfMusic, "Style copied!");
                          }}
                          className="p-1 border border-primary/20 text-zinc-600 hover:text-primary transition-all"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExport(); }}
                          className="p-1 border border-primary/20 text-zinc-600 hover:text-primary transition-all"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copy(result.transition.styleOfMusic, "Style copied!");
                            window.open("https://suno.com/create", "_blank");
                          }}
                          className="p-1 border border-primary/20 text-zinc-600 hover:text-primary transition-all"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                        {resultExpanded
                          ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 ml-1" />
                          : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 ml-1" />
                        }
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {resultExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-2 border-t border-primary/10 space-y-2">
                            <div>
                              <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Style Preview</span>
                              <p className="font-mono text-[10px] text-zinc-400 mt-1 leading-relaxed line-clamp-5">
                                {result.transition.styleOfMusic}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
