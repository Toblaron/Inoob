import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Palette,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  Tag,
  Piano,
  Smile,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MoodSettings {
  genres: string[];
  moods: string[];
  energy: string;
  tempo: string;
  era: string;
  instruments: string[];
  primaryGenre: string;
  reasoning: string;
}

const EXAMPLE_VIBES = [
  "rainy Sunday morning, coffee shop, slightly melancholy but hopeful",
  "high-energy gym workout, aggressive beats, pumping adrenaline",
  "late night city drive, neon lights, nostalgia and longing",
  "summer beach sunset, carefree, golden hour warmth",
  "dark forest at midnight, unsettling, mysterious, haunted",
  "1980s arcade, retro fun, chiptune energy, bright and playful",
];

interface ApplySettings {
  genres?: string[];
  moods?: string[];
  instruments?: string[];
  energy?: string;
  tempo?: string;
  era?: string;
}

interface MoodBoardProps {
  onApplySettings?: (settings: ApplySettings) => void;
  className?: string;
  externalVibe?: string | null;
  externalResult?: MoodSettings | null;
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

export function MoodBoard({ onApplySettings, className, externalVibe, externalResult }: MoodBoardProps) {
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MoodSettings | null>(null);
  const [applied, setApplied] = useState(false);
  const [prevExternalVibe, setPrevExternalVibe] = useState<string | null>(null);

  const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (externalVibe && externalVibe !== prevExternalVibe) {
      setPrevExternalVibe(externalVibe);
      setDescription(externalVibe);
      setExpanded(true);
    }
  }, [externalVibe, prevExternalVibe]);

  useEffect(() => {
    setResult(externalResult ?? null);
    if (externalResult) setExpanded(true);
  }, [externalResult]);

  const handleTranslate = async () => {
    if (description.trim().length < 5) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`${apiBase}/api/mood-to-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Translation failed");
      }
      const data = await resp.json() as MoodSettings;
      setResult(data);
    } catch (err) {
      setError((err as Error).message ?? "Translation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!result || !onApplySettings) return;
    onApplySettings({
      genres: result.genres,
      moods: result.moods,
      instruments: result.instruments,
      energy: result.energy,
      tempo: result.tempo,
      era: result.era,
    });
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleTranslate();
  };

  return (
    <div className={cn("w-full bg-card border border-primary/15 overflow-hidden", className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left hover:bg-primary/3 transition-colors"
      >
        <Palette className="w-4 h-4 text-primary/60 shrink-0" />
        <div className="flex-1">
          <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">Mood Board</span>
          <span className="font-mono text-[11px] text-zinc-400 leading-tight">
            Describe a vibe in words → auto-fill style settings
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
              {/* Example chips */}
              <div>
                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider mb-2">Examples</p>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLE_VIBES.map((vibe) => (
                    <button
                      key={vibe}
                      onClick={() => setDescription(vibe)}
                      className="font-mono text-[10px] px-2 py-1 border border-zinc-700/50 text-zinc-500 hover:border-primary/30 hover:text-zinc-300 transition-all text-left leading-snug"
                    >
                      "{vibe}"
                    </button>
                  ))}
                </div>
              </div>

              {/* Input */}
              <div className="space-y-2">
                <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                  Describe your vibe
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. late night city drive, neon lights, bittersweet nostalgia, 80s feeling..."
                  rows={3}
                  className="w-full bg-zinc-900/60 border border-primary/15 px-3 py-2.5 font-mono text-[11px] text-zinc-300 focus:outline-none focus:border-primary/40 resize-none leading-relaxed"
                />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-zinc-700">
                    Ctrl+Enter to translate
                  </span>
                  <button
                    onClick={handleTranslate}
                    disabled={loading || description.trim().length < 5}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
                      loading || description.trim().length < 5
                        ? "border-zinc-700/50 text-zinc-600 cursor-not-allowed"
                        : "border-primary/40 text-primary hover:border-primary hover:bg-primary/8"
                    )}
                  >
                    {loading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Translating...</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5" /> Translate Vibe</>
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
                  {/* Primary genre highlight */}
                  <div className="px-3 py-3 bg-primary/4 border border-primary/15">
                    <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">Primary Genre</span>
                    <span className="font-mono text-[14px] text-primary font-bold">{result.primaryGenre}</span>
                  </div>

                  {/* Settings grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="px-2.5 py-2 bg-zinc-900/40 border border-primary/10">
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">
                        <Zap className="w-2.5 h-2.5 inline mr-0.5" />Energy
                      </span>
                      <span className="font-mono text-[11px] text-zinc-200 capitalize">{result.energy}</span>
                    </div>
                    <div className="px-2.5 py-2 bg-zinc-900/40 border border-primary/10">
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">
                        <Clock className="w-2.5 h-2.5 inline mr-0.5" />Tempo
                      </span>
                      <span className="font-mono text-[11px] text-zinc-200 capitalize">{result.tempo}</span>
                    </div>
                    <div className="px-2.5 py-2 bg-zinc-900/40 border border-primary/10">
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">
                        <Tag className="w-2.5 h-2.5 inline mr-0.5" />Era
                      </span>
                      <span className="font-mono text-[11px] text-zinc-200">{result.era}</span>
                    </div>
                  </div>

                  {/* Genres */}
                  {result.genres.length > 0 && (
                    <div>
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">Genres</span>
                      <div className="flex flex-wrap gap-1">
                        {result.genres.map((g) => <Chip key={g} label={g} color="cyan" />)}
                      </div>
                    </div>
                  )}

                  {/* Moods */}
                  {result.moods.length > 0 && (
                    <div>
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">
                        <Smile className="w-2.5 h-2.5 inline mr-0.5" />Moods
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {result.moods.map((m) => <Chip key={m} label={m} color="purple" />)}
                      </div>
                    </div>
                  )}

                  {/* Instruments */}
                  {result.instruments.length > 0 && (
                    <div>
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">
                        <Piano className="w-2.5 h-2.5 inline mr-0.5" />Instruments
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {result.instruments.map((inst) => <Chip key={inst} label={inst} color="orange" />)}
                      </div>
                    </div>
                  )}

                  {/* AI reasoning */}
                  <div className="px-3 py-2.5 border border-primary/10 bg-primary/2">
                    <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block mb-1">AI Reasoning</span>
                    <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">{result.reasoning}</p>
                  </div>

                  {/* Apply button */}
                  {onApplySettings && (
                    <button
                      onClick={handleApply}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 py-2.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
                        applied
                          ? "border-green-500/40 text-green-400 bg-green-500/8"
                          : "border-primary bg-primary text-black hover:bg-primary/90"
                      )}
                    >
                      {applied ? (
                        <><CheckCircle2 className="w-3.5 h-3.5" /> Settings Applied!</>
                      ) : (
                        <>Apply These Settings</>
                      )}
                    </button>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
