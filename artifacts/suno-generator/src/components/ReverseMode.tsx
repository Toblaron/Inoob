import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Wand2, X, Music, ChevronRight, ExternalLink } from "lucide-react";
import { reverseTemplate, type ReverseResponse } from "@/lib/manual-api";
import { cn } from "@/lib/utils";

interface ReverseModeProps {
  onClose: () => void;
  className?: string;
}

const PLACEHOLDER = `Example Suno template to analyze:

[PRODUCTION HEADER]
Neo-Soul, 90s R&B, warm, intimate, 78 BPM, key of Ab Major, lush strings, Rhodes piano, finger-snaps, breathy vocals, melancholic but hopeful

[VERSE 1]
Walking through the evening rain
Every drop reminds me of your name
The neon lights reflect below
A city full of places I don't know

[CHORUS]
But you're still here in everything
The way the autumn colors bring
Me back to where we used to be
When love was all we'd ever need`;

export function ReverseMode({ onClose, className }: ReverseModeProps) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ReverseResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAnalyze = input.trim().length >= 50 && !isLoading;

  const handleAnalyze = async () => {
    if (!canAnalyze) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await reverseTemplate(input.trim());
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchYouTube = () => {
    if (!result) return;
    const query = encodeURIComponent(`${result.inferredSong.title} ${result.inferredSong.artist}`);
    window.open(`https://www.youtube.com/results?search_query=${query}`, "_blank");
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
          <Wand2 className="w-4 h-4 text-primary/60" />
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">Reverse Mode</span>
          <span className="font-mono text-[10px] text-zinc-600">Template → Song Inference</span>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {!result ? (
          <>
            <p className="font-mono text-[11px] text-zinc-500 leading-relaxed">
              Paste any Suno-style template below. The AI will infer the likely source song, artist, and the settings that were used to generate it.
            </p>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={10}
              className="w-full bg-zinc-900/50 border border-primary/20 focus:border-primary/50 text-foreground placeholder:text-zinc-800 font-mono text-xs p-3 resize-none focus:outline-none transition-colors"
              disabled={isLoading}
            />

            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] text-zinc-700">{input.length} chars{input.length < 50 ? ` (need ${50 - input.length} more)` : ""}</span>
              <button
                onClick={() => setInput(PLACEHOLDER)}
                className="font-mono text-[9px] text-zinc-700 hover:text-zinc-500 transition-colors"
              >
                Load example
              </button>
            </div>

            {error && (
              <p className="font-mono text-xs text-red-400 px-3 py-2 border border-red-500/20">{error}</p>
            )}

            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-primary bg-primary text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing Template...</>
                : <><Wand2 className="w-3.5 h-3.5" /> Analyze & Reverse Engineer</>
              }
            </button>
          </>
        ) : (
          <div className="space-y-4">
            {/* Inferred song */}
            <div className="px-4 py-3 border border-primary/20 bg-primary/3 space-y-2">
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Inferred Source Song</p>
              <div className="flex items-start gap-3">
                <Music className="w-5 h-5 text-primary/50 mt-0.5 shrink-0" />
                <div>
                  <p className="font-mono text-sm font-bold text-foreground">{result.inferredSong.title}</p>
                  <p className="font-mono text-[11px] text-zinc-400">{result.inferredSong.artist}</p>
                </div>
                <div className="ml-auto shrink-0">
                  <div className={cn(
                    "font-mono text-[10px] px-2 py-1 border font-bold",
                    result.inferredSong.confidence === "high" ? "border-green-500/30 text-green-400" :
                    result.inferredSong.confidence === "medium" ? "border-primary/30 text-primary" :
                    "border-yellow-500/30 text-yellow-400"
                  )}>
                    {result.inferredSong.confidence} conf.
                  </div>
                </div>
              </div>
            </div>

            {/* Analysis notes */}
            {result.analysisNotes && (
              <div className="px-3 py-2.5 border border-zinc-800 bg-zinc-900/30">
                <p className="font-mono text-[10px] text-zinc-500 italic leading-relaxed">{result.analysisNotes}</p>
              </div>
            )}

            {/* Inferred settings */}
            <div className="space-y-2">
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Detected Settings</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: "Key", value: result.audioFeatures.key },
                  { label: "BPM", value: result.audioFeatures.bpm ? `~${result.audioFeatures.bpm}` : null },
                  { label: "Energy", value: result.suggestedSettings.energy },
                  { label: "Era", value: result.suggestedSettings.era },
                ].filter((s) => s.value).map((s) => (
                  <div key={s.label} className="px-2.5 py-1.5 border border-zinc-800 flex items-center justify-between">
                    <span className="font-mono text-[9px] text-zinc-600 uppercase">{s.label}</span>
                    <span className="font-mono text-[10px] text-zinc-300">{s.value}</span>
                  </div>
                ))}
              </div>

              {result.suggestedSettings.genres.length > 0 && (
                <div>
                  <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Genres</p>
                  <div className="flex flex-wrap gap-1">
                    {result.suggestedSettings.genres.map((g) => (
                      <span key={g} className="font-mono text-[10px] px-2 py-0.5 border border-primary/30 text-primary">{g}</span>
                    ))}
                  </div>
                </div>
              )}

              {result.suggestedSettings.moods.length > 0 && (
                <div>
                  <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Moods</p>
                  <div className="flex flex-wrap gap-1">
                    {result.suggestedSettings.moods.map((m) => (
                      <span key={m} className="font-mono text-[10px] px-2 py-0.5 border border-purple-500/30 text-purple-400">{m}</span>
                    ))}
                  </div>
                </div>
              )}

              {result.suggestedSettings.instruments.length > 0 && (
                <div>
                  <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Instruments</p>
                  <div className="flex flex-wrap gap-1">
                    {result.suggestedSettings.instruments.map((inst) => (
                      <span key={inst} className="font-mono text-[10px] px-2 py-0.5 border border-zinc-700 text-zinc-400">{inst}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleSearchYouTube}
                className="flex items-center gap-1.5 flex-1 justify-center py-2 border border-zinc-700 text-zinc-400 font-mono text-xs hover:border-zinc-500 hover:text-zinc-300 transition-all"
              >
                <ExternalLink className="w-3 h-3" /> Find on YouTube
              </button>
              <button
                onClick={() => { setResult(null); setInput(""); }}
                className="flex items-center gap-1.5 flex-1 justify-center py-2 border border-primary/30 text-primary font-mono text-xs hover:bg-primary/10 transition-all"
              >
                <ChevronRight className="w-3 h-3" /> Analyze Another
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
