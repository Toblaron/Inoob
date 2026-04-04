import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, ArrowRight, Download, ExternalLink, Copy, X, GitMerge } from "lucide-react";
import { generateTransition, type TransitionStyle, type TransitionResponse } from "@/lib/manual-api";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

interface TransitionBuilderProps {
  currentYoutubeUrl?: string;
  onClose: () => void;
  className?: string;
}

const STYLE_OPTIONS: { id: TransitionStyle; label: string; description: string }[] = [
  { id: "smooth", label: "Smooth Blend", description: "Gradual BPM/key alignment, seamless for DJ sets" },
  { id: "key-change", label: "Key Change", description: "Dramatic tonal pivot between songs" },
  { id: "genre-blend", label: "Genre Fusion", description: "Hybridize both songs' genres in the bridge" },
  { id: "breakdown", label: "Breakdown Drop", description: "Strip to drums, build tension, drop into Song B" },
];

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be");
  } catch { return false; }
}

export function TransitionBuilder({ currentYoutubeUrl = "", onClose, className }: TransitionBuilderProps) {
  const { copy } = useCopyToClipboard();
  const [fromUrl, setFromUrl] = useState(currentYoutubeUrl);
  const [toUrl, setToUrl] = useState("");
  const [style, setStyle] = useState<TransitionStyle>("smooth");
  const [result, setResult] = useState<TransitionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = isYouTubeUrl(fromUrl) && isYouTubeUrl(toUrl) && !isLoading;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await generateTransition(fromUrl, toUrl, style);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const exportTxt = () => {
    if (!result) return;
    const t = result.template;
    const content = [
      `SUNO TRANSITION TEMPLATE`,
      `From: ${result.fromSong.title} — ${result.fromSong.artist}`,
      `To:   ${result.toSong.title} — ${result.toSong.artist}`,
      `Style: ${result.transitionStyle}`,
      "",
      "STYLE OF MUSIC",
      "=".repeat(50),
      t.styleOfMusic,
      "",
      "TITLE",
      t.title,
      "",
      "LYRICS / METADATA",
      "=".repeat(50),
      t.lyrics,
      "",
      "NEGATIVE PROMPT",
      "=".repeat(50),
      t.negativePrompt,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Transition - ${result.fromSong.title} to ${result.toSong.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
          <GitMerge className="w-4 h-4 text-primary/60" />
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">Transition Generator</span>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {!result ? (
          <>
            {/* URL inputs */}
            <div className="flex items-center gap-2">
              <div className={cn("flex-1 flex items-center border overflow-hidden", isYouTubeUrl(fromUrl) ? "border-green-500/30" : "border-primary/20")}>
                <span className="pl-3 font-mono text-[10px] text-zinc-600 shrink-0">A</span>
                <input
                  value={fromUrl}
                  onChange={(e) => setFromUrl(e.target.value)}
                  placeholder="YouTube URL — Song A (From)"
                  className="w-full py-2 px-2 bg-transparent border-none text-foreground placeholder:text-zinc-700 focus:outline-none text-xs font-mono"
                  disabled={isLoading}
                />
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0" />
              <div className={cn("flex-1 flex items-center border overflow-hidden", isYouTubeUrl(toUrl) ? "border-green-500/30" : "border-primary/20")}>
                <span className="pl-3 font-mono text-[10px] text-zinc-600 shrink-0">B</span>
                <input
                  value={toUrl}
                  onChange={(e) => setToUrl(e.target.value)}
                  placeholder="YouTube URL — Song B (To)"
                  className="w-full py-2 px-2 bg-transparent border-none text-foreground placeholder:text-zinc-700 focus:outline-none text-xs font-mono"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Transition style */}
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Transition Style</p>
              <div className="grid grid-cols-2 gap-1.5">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setStyle(opt.id)}
                    disabled={isLoading}
                    className={cn(
                      "flex flex-col items-start gap-0.5 px-3 py-2 border text-left transition-all disabled:opacity-50",
                      style === opt.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-primary/15 text-zinc-500 hover:border-primary/40"
                    )}
                  >
                    <span className="font-mono text-[11px] font-bold">{opt.label}</span>
                    <span className="font-mono text-[9px] opacity-70">{opt.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="font-mono text-xs text-red-400 px-3 py-2 border border-red-500/20">{error}</p>
            )}

            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-primary bg-primary text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing Both Songs...</>
                : <><GitMerge className="w-3.5 h-3.5" /> Generate Transition</>
              }
            </button>
          </>
        ) : (
          <div className="space-y-4">
            {/* Song info */}
            <div className="flex items-center gap-3 text-center">
              <div className="flex-1 px-3 py-2 border border-blue-500/20 bg-blue-500/5">
                <p className="font-mono text-[10px] font-bold text-blue-400">{result.fromSong.title}</p>
                <p className="font-mono text-[9px] text-zinc-500">{result.fromSong.artist}</p>
                {result.fromSong.bpm && <p className="font-mono text-[9px] text-zinc-600">{result.fromSong.bpm} BPM · {result.fromSong.key}</p>}
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0" />
              <div className="flex-1 px-3 py-2 border border-purple-500/20 bg-purple-500/5">
                <p className="font-mono text-[10px] font-bold text-purple-400">{result.toSong.title}</p>
                <p className="font-mono text-[9px] text-zinc-500">{result.toSong.artist}</p>
                {result.toSong.bpm && <p className="font-mono text-[9px] text-zinc-600">{result.toSong.bpm} BPM · {result.toSong.key}</p>}
              </div>
            </div>

            {/* Template title */}
            <div className="px-4 py-3 border border-primary/20">
              <p className="font-mono text-xs font-bold text-foreground">{result.template.title}</p>
            </div>

            {/* Style prompt */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">Style ({result.template.styleOfMusic.length} chars)</span>
                <button onClick={() => copy(result.template.styleOfMusic, "Style copied!")} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <p className="font-mono text-[10px] text-zinc-400 leading-relaxed line-clamp-4">{result.template.styleOfMusic}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  copy(result.template.styleOfMusic, "Style copied! Opening Suno...");
                  window.open("https://suno.com/create", "_blank");
                }}
                className="flex items-center gap-1.5 flex-1 justify-center py-2 border border-primary/30 text-primary font-mono text-xs hover:bg-primary/10 transition-all"
              >
                <ExternalLink className="w-3 h-3" /> Open Suno
              </button>
              <button
                onClick={exportTxt}
                className="flex items-center gap-1.5 flex-1 justify-center py-2 border border-zinc-700 text-zinc-400 font-mono text-xs hover:border-zinc-500 hover:text-zinc-300 transition-all"
              >
                <Download className="w-3 h-3" /> Export .txt
              </button>
            </div>

            <button
              onClick={() => { setResult(null); setError(null); }}
              className="font-mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              ← Generate Another
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
