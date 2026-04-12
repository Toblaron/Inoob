import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScanSearch,
  Loader2,
  AlertCircle,
  Music2,
  Mic2,
  Zap,
  Clock,
  Gauge,
  Smile,
  Piano,
  Tag,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

interface ReverseResult {
  inferredSong: string | null;
  inferredArtist: string | null;
  inferredGenres: string[];
  inferredEra: string;
  inferredEnergy: string;
  inferredTempo: string;
  inferredMoods: string[];
  inferredInstruments: string[];
  keySignature: string | null;
  bpm: number | null;
  styleConfidence: number;
  reasoning: string;
}

interface ApplySettings {
  genres?: string[];
  moods?: string[];
  instruments?: string[];
  energy?: string;
  tempo?: string;
  era?: string;
}

interface ReverseModeProps {
  onApplySettings?: (settings: ApplySettings) => void;
  className?: string;
}

function ConfidenceBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-green-400 border-green-500/30 bg-green-500/5"
    : score >= 60 ? "text-cyan-400 border-cyan-500/30 bg-cyan-500/5"
    : score >= 40 ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/5"
    : "text-red-400 border-red-500/30 bg-red-500/5";

  return (
    <span className={cn("font-mono text-[10px] px-2 py-0.5 border", color)}>
      {score}% confidence
    </span>
  );
}

function Chip({ label, color = "default" }: { label: string; color?: "default" | "purple" | "cyan" | "green" | "orange" }) {
  const styles = {
    default: "border-primary/20 text-zinc-400 bg-primary/5",
    purple: "border-purple-500/30 text-purple-300 bg-purple-500/8",
    cyan: "border-cyan-500/30 text-cyan-300 bg-cyan-500/8",
    green: "border-green-500/30 text-green-300 bg-green-500/8",
    orange: "border-orange-500/30 text-orange-300 bg-orange-500/8",
  };
  return (
    <span className={cn("font-mono text-[10px] px-2 py-0.5 border", styles[color])}>
      {label}
    </span>
  );
}

export function ReverseMode({ onApplySettings, className }: ReverseModeProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReverseResult | null>(null);
  const [applied, setApplied] = useState(false);
  const { copy } = useCopyToClipboard();

  const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleAnalyze = async () => {
    if (text.trim().length < 20) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`${apiBase}/api/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateText: text }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Analysis failed");
      }
      const data = await resp.json() as ReverseResult;
      setResult(data);
    } catch (err) {
      setError((err as Error).message ?? "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!result || !onApplySettings) return;
    onApplySettings({
      genres: result.inferredGenres,
      moods: result.inferredMoods,
      instruments: result.inferredInstruments,
      energy: result.inferredEnergy,
      tempo: result.inferredTempo,
      era: result.inferredEra,
    });
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  const handleCopyResult = () => {
    if (!result) return;
    const lines = [
      result.inferredSong ? `Song: ${result.inferredSong}` : null,
      result.inferredArtist ? `Artist: ${result.inferredArtist}` : null,
      `Genres: ${result.inferredGenres.join(", ")}`,
      `Era: ${result.inferredEra}`,
      `Energy: ${result.inferredEnergy}`,
      `Tempo: ${result.inferredTempo}`,
      result.inferredMoods.length ? `Moods: ${result.inferredMoods.join(", ")}` : null,
      result.inferredInstruments.length ? `Instruments: ${result.inferredInstruments.join(", ")}` : null,
      result.keySignature ? `Key: ${result.keySignature}` : null,
      result.bpm ? `BPM: ${result.bpm}` : null,
      `\nReasoning: ${result.reasoning}`,
    ].filter(Boolean).join("\n");
    copy(lines, "Analysis copied to clipboard!");
  };

  return (
    <div className={cn("w-full bg-card border border-primary/15 overflow-hidden", className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left hover:bg-primary/3 transition-colors"
      >
        <ScanSearch className="w-4 h-4 text-primary/60 shrink-0" />
        <div className="flex-1">
          <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">Reverse Suno</span>
          <span className="font-mono text-[11px] text-zinc-400 leading-tight">
            Paste any Suno template → infer source song & settings
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
              <div className="space-y-2">
                <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                  Paste a Suno template (style prompt, lyrics, or full template)
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={"Paste Suno style prompt, lyrics, or full template text here...\n\ne.g. \"Deep soul, gospel, 1960s Southern soul, male vocals, Hammond B-3 organ, reverb-drenched guitar...\""}
                  rows={6}
                  className="w-full bg-zinc-900/60 border border-primary/15 px-3 py-2.5 font-mono text-[11px] text-zinc-300 focus:outline-none focus:border-primary/40 resize-none leading-relaxed"
                />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-zinc-700">
                    {text.length} chars
                  </span>
                  <button
                    onClick={handleAnalyze}
                    disabled={loading || text.trim().length < 20}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
                      loading || text.trim().length < 20
                        ? "border-zinc-700/50 text-zinc-600 cursor-not-allowed"
                        : "border-primary/40 text-primary hover:border-primary hover:bg-primary/8"
                    )}
                  >
                    {loading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
                    ) : (
                      <><ScanSearch className="w-3.5 h-3.5" /> Analyze</>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/5 border border-red-500/20">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="font-mono text-[11px] text-red-400">{error}</span>
                </div>
              )}

              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  {/* Song inference */}
                  {(result.inferredSong || result.inferredArtist) && (
                    <div className="px-3 py-3 bg-primary/4 border border-primary/15">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">Inferred Source</span>
                          {result.inferredSong && (
                            <div className="flex items-center gap-1.5">
                              <Music2 className="w-3.5 h-3.5 text-primary/50 shrink-0" />
                              <span className="font-mono text-[13px] text-white font-semibold">{result.inferredSong}</span>
                            </div>
                          )}
                          {result.inferredArtist && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Mic2 className="w-3 h-3 text-zinc-600 shrink-0" />
                              <span className="font-mono text-[11px] text-zinc-400">{result.inferredArtist}</span>
                            </div>
                          )}
                        </div>
                        <ConfidenceBadge score={result.styleConfidence} />
                      </div>
                    </div>
                  )}

                  {/* Settings grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="px-2.5 py-2 bg-zinc-900/40 border border-primary/10">
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">
                        <Zap className="w-2.5 h-2.5 inline mr-0.5" />Energy
                      </span>
                      <span className="font-mono text-[11px] text-zinc-200 capitalize">{result.inferredEnergy}</span>
                    </div>
                    <div className="px-2.5 py-2 bg-zinc-900/40 border border-primary/10">
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">
                        <Clock className="w-2.5 h-2.5 inline mr-0.5" />Tempo
                      </span>
                      <span className="font-mono text-[11px] text-zinc-200 capitalize">{result.inferredTempo}</span>
                    </div>
                    <div className="px-2.5 py-2 bg-zinc-900/40 border border-primary/10">
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">
                        <Tag className="w-2.5 h-2.5 inline mr-0.5" />Era
                      </span>
                      <span className="font-mono text-[11px] text-zinc-200">{result.inferredEra}</span>
                    </div>
                    {(result.keySignature || result.bpm) && (
                      <div className="px-2.5 py-2 bg-zinc-900/40 border border-primary/10">
                        <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">
                          <Gauge className="w-2.5 h-2.5 inline mr-0.5" />Audio
                        </span>
                        <span className="font-mono text-[11px] text-zinc-200">
                          {[result.keySignature, result.bpm ? `${result.bpm} BPM` : null].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Genres */}
                  {result.inferredGenres.length > 0 && (
                    <div>
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">Genres</span>
                      <div className="flex flex-wrap gap-1">
                        {result.inferredGenres.map((g) => (
                          <Chip key={g} label={g} color="cyan" />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Moods */}
                  {result.inferredMoods.length > 0 && (
                    <div>
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">
                        <Smile className="w-2.5 h-2.5 inline mr-0.5" />Moods
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {result.inferredMoods.map((m) => (
                          <Chip key={m} label={m} color="purple" />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Instruments */}
                  {result.inferredInstruments.length > 0 && (
                    <div>
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">
                        <Piano className="w-2.5 h-2.5 inline mr-0.5" />Instruments
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {result.inferredInstruments.map((inst) => (
                          <Chip key={inst} label={inst} color="orange" />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reasoning */}
                  <div className="px-3 py-2.5 border border-primary/10 bg-primary/2">
                    <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">AI Reasoning</span>
                    <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">{result.reasoning}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {onApplySettings && (
                      <button
                        onClick={handleApply}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
                          applied
                            ? "border-green-500/40 text-green-400 bg-green-500/8"
                            : "border-primary bg-primary text-black hover:bg-primary/90"
                        )}
                      >
                        {applied ? (
                          <><CheckCircle2 className="w-3.5 h-3.5" /> Applied!</>
                        ) : (
                          <>Apply These Settings</>
                        )}
                      </button>
                    )}
                    <button
                      onClick={handleCopyResult}
                      className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-primary/20 text-zinc-500 hover:border-primary/40 hover:text-zinc-300 transition-all"
                    >
                      <Copy className="w-3 h-3" />
                      Copy Analysis
                    </button>
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
