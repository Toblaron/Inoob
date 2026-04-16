import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitCompare, X, Loader2, ChevronDown, ChevronUp, Music2, Zap, Clock, Globe, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackSummary {
  title: string;
  artist: string;
  bpm: number | null;
  key: string | null;
  genres: string[];
  releaseYear: string | null;
  language: string;
  lyricsAvailable: boolean;
}

interface CompareResult {
  trackA: TrackSummary;
  trackB: TrackSummary;
  blendSuggestion: string | null;
}

interface ComparePanelProps {
  onClose: () => void;
}

function TrackCard({ track, label }: { track: TrackSummary; label: "A" | "B" }) {
  const color = label === "A" ? "text-cyan-400 border-cyan-500/30 bg-cyan-500/5" : "text-purple-400 border-purple-500/30 bg-purple-500/5";
  return (
    <div className="flex flex-col gap-2.5 bg-zinc-900/50 border border-primary/10 p-4">
      <div className="flex items-center gap-2">
        <span className={cn("font-mono text-[10px] px-1.5 py-0.5 border", color)}>Track {label}</span>
        {track.lyricsAvailable && (
          <span className="font-mono text-[9px] text-green-500/70 border border-green-500/20 px-1.5 py-0.5">Lyrics ✓</span>
        )}
      </div>
      <div>
        <p className="font-semibold text-sm text-white leading-tight">{track.title}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{track.artist}</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {track.bpm && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800/60">
            <Zap className="w-3 h-3 text-primary/50 shrink-0" />
            <span className="font-mono text-[10px] text-zinc-300">{track.bpm} BPM</span>
          </div>
        )}
        {track.key && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800/60">
            <Music2 className="w-3 h-3 text-primary/50 shrink-0" />
            <span className="font-mono text-[10px] text-zinc-300">{track.key}</span>
          </div>
        )}
        {track.releaseYear && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800/60">
            <Clock className="w-3 h-3 text-primary/50 shrink-0" />
            <span className="font-mono text-[10px] text-zinc-300">{track.releaseYear}</span>
          </div>
        )}
        {track.language !== "English" && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800/60">
            <Globe className="w-3 h-3 text-primary/50 shrink-0" />
            <span className="font-mono text-[10px] text-zinc-300">{track.language}</span>
          </div>
        )}
      </div>
      {track.genres.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {track.genres.slice(0, 4).map((g) => (
            <span key={g} className="font-mono text-[9px] px-1.5 py-0.5 border border-primary/20 text-zinc-400">{g}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ComparePanel({ onClose }: ComparePanelProps) {
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blendExpanded, setBlendExpanded] = useState(true);

  const canCompare = urlA.trim().length > 10 && urlB.trim().length > 10;

  const handleCompare = async () => {
    if (!canCompare) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urlA: urlA.trim(), urlB: urlB.trim() }),
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Compare failed" })) as { error?: string };
        throw new Error(err.error ?? "Comparison failed");
      }
      const data = await resp.json() as CompareResult;
      setResult(data);
      setBlendExpanded(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="bg-card border border-primary/20 p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-primary/60" />
          <div>
            <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">A/B Reference Compare</span>
            <span className="font-mono text-[11px] text-zinc-400">Compare two tracks — get blend suggestions</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* URL inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="font-mono text-[9px] text-cyan-500/70 uppercase tracking-wider">Track A — YouTube or Deezer</label>
          <input
            type="url"
            value={urlA}
            onChange={(e) => setUrlA(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="w-full bg-zinc-900/60 border border-cyan-500/20 focus:border-cyan-500/50 px-3 py-2 font-mono text-xs text-zinc-300 placeholder:text-zinc-700 focus:outline-none transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="font-mono text-[9px] text-purple-500/70 uppercase tracking-wider">Track B — YouTube or Deezer</label>
          <input
            type="url"
            value={urlB}
            onChange={(e) => setUrlB(e.target.value)}
            placeholder="https://deezer.com/track/..."
            className="w-full bg-zinc-900/60 border border-purple-500/20 focus:border-purple-500/50 px-3 py-2 font-mono text-xs text-zinc-300 placeholder:text-zinc-700 focus:outline-none transition-colors"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleCompare}
        disabled={!canCompare || loading}
        className="flex items-center gap-2 px-4 py-2 font-mono text-[11px] uppercase tracking-wider border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCompare className="w-3.5 h-3.5" />}
        {loading ? "Analyzing both tracks..." : "Compare Tracks"}
      </button>

      {error && (
        <p className="font-mono text-[11px] text-destructive border border-destructive/20 bg-destructive/5 px-3 py-2">{error}</p>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TrackCard track={result.trackA} label="A" />
              <TrackCard track={result.trackB} label="B" />
            </div>

            {result.blendSuggestion && (
              <div className="bg-zinc-900/50 border border-primary/15 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setBlendExpanded((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-primary/5 transition-colors text-left"
                >
                  <Wand2 className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                  <span className="flex-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">AI Blend Suggestion</span>
                  {blendExpanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
                </button>
                <AnimatePresence initial={false}>
                  {blendExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <p className="px-4 pb-4 text-sm text-zinc-300 leading-relaxed border-t border-primary/10 pt-3">
                        {result.blendSuggestion}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
