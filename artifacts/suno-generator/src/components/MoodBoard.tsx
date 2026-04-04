import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, Check, X, Lightbulb } from "lucide-react";
import { moodToSettings, type MoodSettingsResponse } from "@/lib/manual-api";
import { cn } from "@/lib/utils";

interface MoodBoardProps {
  onApplySettings: (settings: MoodSettingsResponse) => void;
  onClose: () => void;
  className?: string;
}

const EXAMPLE_MOODS = [
  "rainy Sunday morning, coffee shop, melancholy but hopeful",
  "driving at night in the city, windows down, neon lights",
  "summer bonfire with friends, nostalgic and free",
  "late night studying, anxious but focused",
  "triumphant workout session, peak energy, unstoppable",
  "quiet beach at sunset, reflective and peaceful",
  "underground rave at 3am, dark and hypnotic",
  "romantic candlelit dinner, intimate and sensual",
];

export function MoodBoard({ onApplySettings, onClose, className }: MoodBoardProps) {
  const [moodText, setMoodText] = useState("");
  const [result, setResult] = useState<MoodSettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConvert = async () => {
    const text = moodText.trim();
    if (text.length < 5) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await moodToSettings(text);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (result) {
      onApplySettings(result);
      onClose();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className={cn("bg-card border border-primary/25 overflow-hidden", className)}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-primary/10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary/60" />
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">Mood Board</span>
          <span className="font-mono text-[10px] text-zinc-600">Describe a vibe → get style settings</span>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Text input */}
        <div>
          <textarea
            value={moodText}
            onChange={(e) => setMoodText(e.target.value)}
            placeholder="Describe a feeling, scene, or vibe... e.g. 'rainy Sunday morning, coffee shop, slightly melancholy but hopeful'"
            rows={3}
            className="w-full bg-zinc-900/50 border border-primary/20 focus:border-primary/50 text-foreground placeholder:text-zinc-700 font-mono text-xs p-3 resize-none focus:outline-none transition-colors"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleConvert();
            }}
          />
          <p className="font-mono text-[9px] text-zinc-700 mt-1">Ctrl+Enter to convert</p>
        </div>

        {/* Example prompts */}
        {!result && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Lightbulb className="w-3 h-3 text-zinc-600" />
              <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Examples</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {EXAMPLE_MOODS.slice(0, 4).map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setMoodText(ex)}
                  className="font-mono text-[9px] px-2 py-1 border border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400 transition-colors text-left"
                >
                  {ex.slice(0, 40)}…
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="font-mono text-xs text-red-400">{error}</p>}

        <button
          onClick={handleConvert}
          disabled={isLoading || moodText.trim().length < 5}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-primary bg-primary text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Converting Vibe...</>
            : <><Sparkles className="w-3.5 h-3.5" /> Convert to Music Settings</>
          }
        </button>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-3"
            >
              {/* Genres */}
              <div>
                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1.5">Genres</p>
                <div className="flex flex-wrap gap-1">
                  {result.genres.map((g) => (
                    <span key={g} className="font-mono text-[10px] px-2 py-0.5 border border-primary/30 text-primary">{g}</span>
                  ))}
                </div>
              </div>

              {/* Moods */}
              <div>
                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1.5">Moods</p>
                <div className="flex flex-wrap gap-1">
                  {result.moods.map((m) => (
                    <span key={m} className="font-mono text-[10px] px-2 py-0.5 border border-purple-500/30 text-purple-400">{m}</span>
                  ))}
                </div>
              </div>

              {/* Other settings */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Energy", value: result.energy },
                  { label: "Tempo", value: result.tempo },
                  { label: "Era", value: result.era ?? "auto" },
                ].map((s) => (
                  <div key={s.label} className="px-2.5 py-1.5 border border-zinc-800 text-center">
                    <p className="font-mono text-[9px] text-zinc-600 uppercase">{s.label}</p>
                    <p className="font-mono text-xs text-zinc-300">{s.value}</p>
                  </div>
                ))}
              </div>

              {result.instruments.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {result.instruments.map((inst) => (
                    <span key={inst} className="font-mono text-[10px] px-2 py-0.5 border border-zinc-700 text-zinc-400">{inst}</span>
                  ))}
                </div>
              )}

              {result.reasoning && (
                <p className="font-mono text-[10px] text-zinc-500 italic">{result.reasoning}</p>
              )}

              <button
                onClick={handleApply}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-primary bg-primary text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                Apply These Settings
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
