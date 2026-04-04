import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Copy, Download, ExternalLink, Check, Music, Mic2, Drum, Guitar, X } from "lucide-react";
import { generateMultiTrack, type MultiTrackResponse, type TrackResult } from "@/lib/manual-api";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { SunoTemplate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface MultiTrackBuilderProps {
  youtubeUrl: string;
  options?: Record<string, unknown>;
  onSelectTemplate?: (template: SunoTemplate) => void;
  onClose: () => void;
  className?: string;
}

const TRACK_META: Record<string, { icon: React.ReactNode; color: string; description: string }> = {
  lead: {
    icon: <Mic2 className="w-4 h-4" />,
    color: "border-blue-500/40 text-blue-400 bg-blue-500/5",
    description: "Main vocal performance with full lyrics and melody",
  },
  harmony: {
    icon: <Music className="w-4 h-4" />,
    color: "border-purple-500/40 text-purple-400 bg-purple-500/5",
    description: "Backing vocals, harmonies, and vocal stack",
  },
  instrumental: {
    icon: <Guitar className="w-4 h-4" />,
    color: "border-green-500/40 text-green-400 bg-green-500/5",
    description: "Full instrumental bed — no vocals",
  },
  rhythm: {
    icon: <Drum className="w-4 h-4" />,
    color: "border-orange-500/40 text-orange-400 bg-orange-500/5",
    description: "Rhythm section: drums, bass, and percussion",
  },
};

function TrackCard({ track, onSelect, onClose }: { track: TrackResult; onSelect?: (t: SunoTemplate) => void; onClose: () => void }) {
  const { copy } = useCopyToClipboard();
  const [expanded, setExpanded] = useState(false);
  const meta = TRACK_META[track.trackId] ?? TRACK_META.lead;

  const handleOpenSuno = () => {
    copy(track.template.styleOfMusic, "Style prompt copied! Paste into Suno's Style field.");
    window.open("https://suno.com/create", "_blank");
  };

  const exportTxt = () => {
    const t = track.template;
    const content = [
      `SUNO TEMPLATE — ${t.songTitle}`,
      `Track: ${track.label}`,
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
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t.songTitle} [${track.trackId}].txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("border overflow-hidden", meta.color)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/3 transition-colors"
      >
        <span className="shrink-0">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs font-bold">{track.label}</p>
          <p className="font-mono text-[10px] text-zinc-500">{meta.description}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); handleOpenSuno(); }}
            title="Copy style + open Suno"
            className="p-1 border border-current/30 hover:bg-current/10 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); exportTxt(); }}
            title="Export as .txt"
            className="p-1 border border-current/30 hover:bg-current/10 transition-colors"
          >
            <Download className="w-3 h-3" />
          </button>
          {onSelect && (
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(track.template); onClose(); }}
              className="px-2 py-0.5 border border-current/50 font-mono text-[10px] uppercase hover:bg-current/10 transition-colors"
            >
              Use
            </button>
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-current/15"
          >
            <div className="p-4 space-y-3">
              {/* Style prompt */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">Style ({track.template.styleOfMusic.length} chars)</span>
                  <button onClick={() => copy(track.template.styleOfMusic, "Style copied!")} className="text-zinc-600 hover:text-zinc-400">
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <p className="font-mono text-[10px] text-zinc-400 leading-relaxed line-clamp-4">{track.template.styleOfMusic}</p>
              </div>
              {/* Title */}
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-zinc-300">{track.template.title}</span>
                <button onClick={() => copy(track.template.title, "Title copied!")} className="text-zinc-600 hover:text-zinc-400">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MultiTrackBuilder({ youtubeUrl, options = {}, onSelectTemplate, onClose, className }: MultiTrackBuilderProps) {
  const [result, setResult] = useState<MultiTrackResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedSuno, setOpenedSuno] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await generateMultiTrack(youtubeUrl, options as Record<string, string>);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadAll = () => {
    if (!result) return;
    const content = result.tracks.map((track) => {
      const t = track.template;
      return [
        `${"=".repeat(70)}`,
        `TRACK: ${track.label}`,
        `${"=".repeat(70)}`,
        "",
        "STYLE OF MUSIC",
        t.styleOfMusic,
        "",
        "TITLE",
        t.title,
        "",
        "LYRICS / METADATA",
        t.lyrics,
        "",
        "NEGATIVE PROMPT",
        t.negativePrompt,
        "",
      ].join("\n");
    }).join("\n\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.songTitle} - Multi-Track Arrangement.txt`;
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
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-primary/10">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-primary/60" />
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">Multi-Track Arrangement</span>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {!result && !isLoading && (
          <div className="space-y-3">
            <p className="font-mono text-[11px] text-zinc-500 leading-relaxed">
              Generate 4 complementary Suno templates for a full arrangement: lead vocal, harmony/backing, instrumental bed, and rhythm track. Each is designed to layer together in the same key and tempo.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TRACK_META).map(([id, meta]) => (
                <div key={id} className={cn("flex items-center gap-2 p-2.5 border font-mono text-[10px]", meta.color)}>
                  {meta.icon}
                  <div>
                    <p className="font-bold capitalize">{id}</p>
                    <p className="text-[9px] opacity-60">{meta.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={handleGenerate}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-primary bg-primary text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all"
            >
              <Music className="w-3.5 h-3.5" />
              Generate 4-Track Arrangement
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary/60" />
            <p className="font-mono text-xs text-zinc-500">Generating 4 complementary tracks in parallel...</p>
            <div className="grid grid-cols-4 gap-2 w-full">
              {["Lead", "Harmony", "Instrumental", "Rhythm"].map((label) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <div className="w-6 h-6 border border-primary/20 flex items-center justify-center">
                    <Loader2 className="w-3 h-3 animate-spin text-primary/40" />
                  </div>
                  <span className="font-mono text-[9px] text-zinc-600">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="px-4 py-3 border border-red-500/20 bg-red-500/5">
            <p className="font-mono text-xs text-red-400">{error}</p>
            <button onClick={handleGenerate} className="mt-2 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Retry</button>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm font-bold text-foreground">{result.songTitle}</p>
                <p className="font-mono text-[10px] text-zinc-500">{result.artist}</p>
              </div>
              <button
                onClick={downloadAll}
                className="flex items-center gap-1.5 font-mono text-[10px] text-primary hover:text-primary/80 transition-colors"
              >
                <Download className="w-3 h-3" />
                Download All
              </button>
            </div>

            <p className="font-mono text-[10px] text-zinc-600 italic">{result.arrangementNote}</p>

            <div className="space-y-2">
              {result.tracks.map((track) => (
                <TrackCard key={track.trackId} track={track} onSelect={onSelectTemplate} onClose={onClose} />
              ))}
            </div>

            <button
              onClick={() => {
                setResult(null);
                setError(null);
              }}
              className="font-mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              ← Generate Again
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
