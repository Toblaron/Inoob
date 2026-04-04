import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, ChevronDown, ChevronUp, Check, AlertTriangle, X } from "lucide-react";
import { optimizeTemplate, type OptimizeResponse } from "@/lib/manual-api";
import type { SunoTemplate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface PromptOptimizerProps {
  template: SunoTemplate;
  className?: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-green-400 border-green-500/40 bg-green-500/10",
  B: "text-primary border-primary/40 bg-primary/10",
  C: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  D: "text-orange-400 border-orange-500/40 bg-orange-500/10",
  F: "text-red-400 border-red-500/40 bg-red-500/10",
};

const CHECK_LABELS: Record<keyof OptimizeResponse["breakdown"], string> = {
  styleLength: "Style Length",
  lyricsLength: "Lyrics Length",
  negativeLength: "Negative Length",
  hasBPM: "Has BPM",
  hasKey: "Has Key",
  hasChordProgression: "Chord Progression",
  hasHookIdentity: "Hook Identity",
  hasDynamics: "Dynamic Contrast",
  hasArticulation: "Articulation Terms",
  hasProductionHeader: "Production Header",
  hasAdLibs: "Ad-Libs",
  sectionCount: "Section Count",
  clicheCount: "Cliché Count",
};

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-zinc-900 rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-primary" : pct >= 40 ? "bg-yellow-500" : "bg-red-500")}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span className="font-mono text-[10px] text-zinc-500 w-8 text-right">{value}</span>
    </div>
  );
}

export function PromptOptimizer({ template, className }: PromptOptimizerProps) {
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await optimizeTemplate(template);
        if (!cancelled) {
          setResult(res);
          // Auto-expand if poor score
          if (res.score < 70) setExpanded(true);
        }
      } catch {
        // Silent fail — optimizer is advisory only
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [template.styleOfMusic, template.lyrics, template.negativePrompt]);

  if (!result && !loading) return null;

  const gradeColor = result ? (GRADE_COLORS[result.grade] ?? GRADE_COLORS.F) : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("border border-primary/20 overflow-hidden", className)}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-primary/5 transition-colors"
        disabled={loading}
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-primary/50" />
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">Prompt Quality</span>
          {loading && <span className="font-mono text-[10px] text-zinc-600 animate-pulse">analyzing...</span>}
        </div>
        {result && (
          <div className="flex items-center gap-2">
            <div className={cn("flex items-center gap-1 px-2 py-0.5 border font-mono text-[11px] font-bold", gradeColor)}>
              <span>{result.grade}</span>
              <span className="text-[10px] font-normal opacity-70">{result.score}/100</span>
            </div>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
          </div>
        )}
      </button>

      <AnimatePresence>
        {expanded && result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-primary/10 pt-3 space-y-4">

              {/* Score breakdown */}
              <div className="space-y-2">
                <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Score Details</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {/* Lengths */}
                  <div>
                    <span className="font-mono text-[9px] text-zinc-600 block mb-0.5">Style ({result.breakdown.styleLength}/900)</span>
                    <ScoreBar value={result.breakdown.styleLength} max={900} />
                  </div>
                  <div>
                    <span className="font-mono text-[9px] text-zinc-600 block mb-0.5">Lyrics ({result.breakdown.lyricsLength}/4999)</span>
                    <ScoreBar value={result.breakdown.lyricsLength} max={4999} />
                  </div>
                  <div>
                    <span className="font-mono text-[9px] text-zinc-600 block mb-0.5">Negative ({result.breakdown.negativeLength}/199)</span>
                    <ScoreBar value={result.breakdown.negativeLength} max={199} />
                  </div>
                  <div>
                    <span className="font-mono text-[9px] text-zinc-600 block mb-0.5">Sections ({result.breakdown.sectionCount})</span>
                    <ScoreBar value={Math.min(result.breakdown.sectionCount, 10)} max={10} />
                  </div>
                </div>
              </div>

              {/* Boolean checks */}
              <div className="grid grid-cols-2 gap-1">
                {([
                  ["hasBPM", result.breakdown.hasBPM],
                  ["hasKey", result.breakdown.hasKey],
                  ["hasChordProgression", result.breakdown.hasChordProgression],
                  ["hasHookIdentity", result.breakdown.hasHookIdentity],
                  ["hasDynamics", result.breakdown.hasDynamics],
                  ["hasArticulation", result.breakdown.hasArticulation],
                  ["hasProductionHeader", result.breakdown.hasProductionHeader],
                  ["hasAdLibs", result.breakdown.hasAdLibs],
                ] as [keyof OptimizeResponse["breakdown"], boolean][]).map(([key, val]) => (
                  <div key={key} className={cn(
                    "flex items-center gap-1.5 px-2 py-1 border font-mono text-[9px]",
                    val ? "border-green-500/20 text-green-400" : "border-zinc-800 text-zinc-600"
                  )}>
                    {val ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                    {CHECK_LABELS[key]}
                  </div>
                ))}
              </div>

              {/* Clichés */}
              {result.breakdown.clicheCount > 0 && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 border border-yellow-500/20 bg-yellow-500/3">
                  <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />
                  <span className="font-mono text-[10px] text-yellow-400">{result.breakdown.clicheCount} overused phrase{result.breakdown.clicheCount !== 1 ? "s" : ""} detected</span>
                </div>
              )}

              {/* Suggestions */}
              {result.suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <button
                    onClick={() => setShowSuggestions((v) => !v)}
                    className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <TrendingUp className="w-3 h-3" />
                    {showSuggestions ? "Hide" : "Show"} {result.suggestions.length} suggestion{result.suggestions.length !== 1 ? "s" : ""}
                    {showSuggestions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <AnimatePresence>
                    {showSuggestions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-1.5"
                      >
                        {result.suggestions.map((suggestion, i) => (
                          <div key={i} className="flex items-start gap-2 px-2.5 py-2 border border-zinc-800 bg-zinc-900/50">
                            <span className="font-mono text-[10px] text-primary/50 shrink-0 mt-0.5">{i + 1}.</span>
                            <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">{suggestion}</p>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {result.score >= 90 && (
                <div className="flex items-center gap-2 px-2.5 py-2 border border-green-500/20 bg-green-500/3">
                  <Check className="w-3 h-3 text-green-400 shrink-0" />
                  <p className="font-mono text-[10px] text-green-400">Excellent template — production-ready quality.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
