import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Mic2,
  Music2,
  Music,
  Gauge,
  Copy,
  Download,
  ExternalLink,
  CheckCircle2,
  Check,
} from "lucide-react";
import type { SunoTemplate } from "@workspace/api-client-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

type TrackId = "lead" | "harmony" | "instrumental" | "rhythm";

interface TrackResult {
  id: TrackId;
  label: string;
  icon: string;
  template: SunoTemplate | null;
  error: string | null;
}

interface MultiTrackResponse {
  tracks: TrackResult[];
}

const TRACK_META: Record<TrackId, { icon: React.ReactNode; textColor: string; borderColor: string; bgColor: string; description: string }> = {
  lead: {
    icon: <Mic2 className="w-4 h-4" />,
    textColor: "text-primary",
    borderColor: "border-primary/30",
    bgColor: "bg-primary/5",
    description: "Main vocal arrangement — the full song with lead vocals prominent",
  },
  harmony: {
    icon: <Layers className="w-4 h-4" />,
    textColor: "text-purple-400",
    borderColor: "border-purple-500/30",
    bgColor: "bg-purple-500/5",
    description: "Backing vocals & harmonies — supporting layers to complement the lead",
  },
  instrumental: {
    icon: <Music className="w-4 h-4" />,
    textColor: "text-cyan-400",
    borderColor: "border-cyan-500/30",
    bgColor: "bg-cyan-500/5",
    description: "Rich instrumental bed — no vocals, melody-focused arrangement",
  },
  rhythm: {
    icon: <Gauge className="w-4 h-4" />,
    textColor: "text-orange-400",
    borderColor: "border-orange-500/30",
    bgColor: "bg-orange-500/5",
    description: "Percussion-driven groove — rhythm and drums focused track",
  },
};

function TrackCard({ track }: { track: TrackResult }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const { copy } = useCopyToClipboard();
  const meta = TRACK_META[track.id];

  const handleCopy = () => {
    if (!track.template) return;
    const text = [
      `=== STYLE ===\n${track.template.styleOfMusic}`,
      `=== TITLE ===\n${track.template.title}`,
      `=== LYRICS ===\n${track.template.lyrics}`,
      `=== NEGATIVE ===\n${track.template.negativePrompt}`,
    ].join("\n\n");
    copy(text, `${track.label} track copied!`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    if (!track.template) return;
    const text = [
      `TRACK: ${track.label.toUpperCase()}`,
      `Song: ${track.template.songTitle} — ${track.template.artist}`,
      "",
      "=".repeat(50),
      "STYLE OF MUSIC",
      "=".repeat(50),
      track.template.styleOfMusic,
      "",
      "=".repeat(50),
      "TITLE",
      "=".repeat(50),
      track.template.title,
      "",
      "=".repeat(50),
      "LYRICS / METADATA",
      "=".repeat(50),
      track.template.lyrics,
      "",
      "=".repeat(50),
      "NEGATIVE PROMPT",
      "=".repeat(50),
      track.template.negativePrompt,
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${track.template.songTitle} - ${track.label} Track.txt`.replace(/[/\\?%*:|"<>]/g, "");
    a.click();
    URL.revokeObjectURL(url);
  };

  if (track.error) {
    return (
      <div className={cn("border p-3 flex items-center gap-2", "border-red-500/20 bg-red-500/3")}>
        <span className={cn("shrink-0", meta.textColor)}>{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <span className="font-mono text-[11px] text-zinc-300 font-semibold">{track.label}</span>
          <p className="font-mono text-[10px] text-red-400 mt-0.5">{track.error}</p>
        </div>
      </div>
    );
  }

  if (!track.template) return null;

  return (
    <div className={cn("border overflow-hidden", meta.borderColor)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-3 text-left hover:bg-white/2 transition-colors"
      >
        <span className={cn("shrink-0", meta.textColor)}>{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <span className="font-mono text-[11px] text-zinc-200 font-semibold">{track.label}</span>
          <p className="font-mono text-[10px] text-zinc-600 mt-0.5 leading-tight">{meta.description}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            className="p-1.5 border border-primary/15 text-zinc-600 hover:text-primary hover:border-primary/40 transition-all"
            title="Copy template"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleExport(); }}
            className="p-1.5 border border-primary/15 text-zinc-600 hover:text-primary hover:border-primary/40 transition-all"
            title="Export as .txt"
          >
            <Download className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copy(track.template!.styleOfMusic, "Style copied! Pasting into Suno...");
              window.open("https://suno.com/create", "_blank");
            }}
            className="p-1.5 border border-primary/15 text-zinc-600 hover:text-primary hover:border-primary/40 transition-all"
            title="Open Suno"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 ml-1" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-primary/8 space-y-2 pt-2">
              <div>
                <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Style Preview</span>
                <p className="font-mono text-[10px] text-zinc-400 mt-1 leading-relaxed line-clamp-4">
                  {track.template.styleOfMusic}
                </p>
              </div>
              <div>
                <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Title</span>
                <p className="font-mono text-[11px] text-zinc-300 mt-0.5">{track.template.title}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface MultiTrackBuilderProps {
  youtubeUrl?: string;
  vocalGender?: string;
  energyLevel?: string;
  era?: string;
  mode?: string;
  genres?: string[];
  moods?: string[];
  instruments?: string[];
  className?: string;
}

export function MultiTrackBuilder({
  youtubeUrl,
  vocalGender,
  energyLevel,
  era,
  mode,
  genres,
  moods,
  instruments,
  className,
}: MultiTrackBuilderProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TrackResult[] | null>(null);
  const [downloadAll, setDownloadAll] = useState(false);
  const { copy } = useCopyToClipboard();

  const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleGenerate = async () => {
    if (!youtubeUrl) return;
    setLoading(true);
    setError(null);
    setTracks(null);
    try {
      const resp = await fetch(`${apiBase}/api/multi-track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl, vocalGender, energyLevel, era, mode, genres, moods, instruments }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Multi-track generation failed");
      }
      const data = await resp.json() as MultiTrackResponse;
      setTracks(data.tracks);
    } catch (err) {
      setError((err as Error).message ?? "Multi-track generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadAll = () => {
    if (!tracks) return;
    const successful = tracks.filter((t) => t.template);
    if (successful.length === 0) return;

    const sections = successful.map((t) => {
      const tmpl = t.template!;
      return [
        `${"=".repeat(60)}`,
        `TRACK: ${t.label.toUpperCase()}`,
        `${"=".repeat(60)}`,
        `Song: ${tmpl.songTitle} — ${tmpl.artist}`,
        "",
        "── STYLE OF MUSIC ──",
        tmpl.styleOfMusic,
        "",
        "── TITLE ──",
        tmpl.title,
        "",
        "── LYRICS / METADATA ──",
        tmpl.lyrics,
        "",
        "── NEGATIVE PROMPT ──",
        tmpl.negativePrompt,
        "",
      ].join("\n");
    }).join("\n");

    const blob = new Blob([sections], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Multi-Track Arrangement.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadAll(true);
    setTimeout(() => setDownloadAll(false), 2000);
  };

  return (
    <div className={cn("w-full bg-card border border-primary/15 overflow-hidden", className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left hover:bg-primary/3 transition-colors"
      >
        <Layers className="w-4 h-4 text-primary/60 shrink-0" />
        <div className="flex-1">
          <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">Multi-Track Arrangement</span>
          <span className="font-mono text-[11px] text-zinc-400 leading-tight">
            Generate 4 complementary tracks: lead, harmony, instrumental, rhythm
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
              {/* Track preview cards (before generation) */}
              {!tracks && !loading && (
                <div className="grid grid-cols-2 gap-2">
                  {(["lead", "harmony", "instrumental", "rhythm"] as TrackId[]).map((id) => {
                    const meta = TRACK_META[id];
                    return (
                      <div key={id} className="flex items-start gap-2 px-3 py-2.5 border border-zinc-800/60 bg-zinc-900/30">
                        <span className={cn("shrink-0 mt-0.5", meta.textColor)}>{meta.icon}</span>
                        <div>
                          <span className="font-mono text-[11px] text-zinc-300 font-semibold capitalize">{id === "rhythm" ? "Rhythm" : id.charAt(0).toUpperCase() + id.slice(1)}</span>
                          <p className="font-mono text-[9px] text-zinc-600 mt-0.5 leading-tight">{meta.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/5 border border-red-500/20">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="font-mono text-[11px] text-red-400">{error}</span>
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center gap-2.5 py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="font-mono text-[11px] text-primary/60">
                    Generating 4 complementary arrangements in parallel...
                  </span>
                </div>
              )}

              {tracks && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  {tracks.map((track) => (
                    <TrackCard key={track.id} track={track} />
                  ))}
                  <button
                    onClick={handleDownloadAll}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2 font-mono text-[11px] uppercase tracking-wider border transition-all mt-2",
                      downloadAll
                        ? "border-green-500/40 text-green-400"
                        : "border-primary/20 text-zinc-500 hover:border-primary/40 hover:text-zinc-300"
                    )}
                  >
                    {downloadAll
                      ? <><CheckCircle2 className="w-3.5 h-3.5" /> Downloaded!</>
                      : <><Download className="w-3.5 h-3.5" /> Download All Tracks (.txt)</>
                    }
                  </button>
                </motion.div>
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={loading || !youtubeUrl}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-2.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
                  loading || !youtubeUrl
                    ? "border-zinc-700/50 text-zinc-600 cursor-not-allowed"
                    : "border-primary bg-primary text-black hover:bg-primary/90"
                )}
              >
                {loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating Arrangement...</>
                ) : (
                  <><Music2 className="w-3.5 h-3.5" /> {tracks ? "Regenerate" : "Generate Arrangement"}</>
                )}
              </button>

              {!youtubeUrl && (
                <p className="font-mono text-[10px] text-zinc-600 text-center">
                  Enter a YouTube URL above first
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
