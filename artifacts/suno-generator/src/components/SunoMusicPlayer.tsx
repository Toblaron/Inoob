import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music4,
  Play,
  Pause,
  Loader2,
  AlertCircle,
  ExternalLink,
  Download,
  CheckCircle2,
  Coins,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SunoTemplate } from "@workspace/api-client-react";
import type { SunoTrack, SunoTaskStatus } from "@workspace/api-client-react";

const SUNOAPI_KEY_MISSING_MSG =
  "Suno music generation is not configured — SUNOAPI_KEY missing.";

interface SunoMusicPlayerProps {
  template: SunoTemplate;
}

type GenerateState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "polling"; taskId: string; elapsed: number }
  | { phase: "done"; taskId: string; tracks: SunoTrack[] }
  | { phase: "error"; message: string };

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_MS = 5 * 60 * 1000;

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const apiBase = () => import.meta.env.BASE_URL.replace(/\/$/, "");

async function callGenerate(template: SunoTemplate, signal: AbortSignal) {
  const res = await fetch(`${apiBase()}/api/suno/music/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      styleOfMusic: template.styleOfMusic,
      lyrics: template.lyrics,
      title: template.title,
      negativePrompt: template.negativePrompt || undefined,
      instrumental: false,
      model: "V5_5",
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ taskId: string; status: SunoTaskStatus; tracks?: SunoTrack[] }>;
}

async function callStatus(taskId: string, signal: AbortSignal) {
  const res = await fetch(`${apiBase()}/api/suno/music/status/${encodeURIComponent(taskId)}`, {
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ taskId: string; status: SunoTaskStatus; tracks?: SunoTrack[]; error?: string }>;
}

async function callCredits(): Promise<number | null> {
  try {
    const res = await fetch(`${apiBase()}/api/suno/music/credits`);
    if (!res.ok) return null;
    const body = await res.json() as { credits?: number };
    return body.credits ?? null;
  } catch {
    return null;
  }
}

function TrackCard({ track }: { track: SunoTrack }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(track.duration ?? null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlaying(false);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDuration);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
    };
  }, []);

  const progress = duration ? currentTime / duration : 0;

  return (
    <div className="flex flex-col gap-2 bg-zinc-900/60 border border-primary/10 p-3">
      {track.audio_url && (
        <audio ref={audioRef} src={track.audio_url} preload="metadata" />
      )}

      <div className="flex items-center gap-3">
        {/* Cover art */}
        {track.image_url ? (
          <img
            src={track.image_url}
            alt="cover"
            className="w-12 h-12 shrink-0 object-cover border border-primary/15"
          />
        ) : (
          <div className="w-12 h-12 shrink-0 bg-zinc-800 border border-primary/10 flex items-center justify-center">
            <Music4 className="w-5 h-5 text-primary/30" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] text-zinc-300 truncate">
            {track.title ?? "Track"}
          </p>
          {track.model_name && (
            <p className="font-mono text-[10px] text-zinc-600">{track.model_name}</p>
          )}
        </div>

        {/* Play / Pause */}
        {track.audio_url && (
          <button
            onClick={togglePlay}
            className="w-8 h-8 shrink-0 flex items-center justify-center border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        )}

        {/* Download */}
        {track.audio_url && (
          <a
            href={track.audio_url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 shrink-0 flex items-center justify-center border border-primary/15 text-zinc-500 hover:border-primary/40 hover:text-zinc-300 transition-colors"
            aria-label="Download"
            title="Download audio"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        )}

        {/* Open on Suno */}
        {track.id && (
          <a
            href={`https://suno.com/song/${track.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 shrink-0 flex items-center justify-center border border-primary/15 text-zinc-500 hover:border-primary/40 hover:text-zinc-300 transition-colors"
            aria-label="Open on Suno"
            title="Open on Suno.com"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Waveform progress bar */}
      {track.audio_url && duration && (
        <div className="flex items-center gap-2">
          <div
            className="flex-1 h-1 bg-zinc-800 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              if (audioRef.current) {
                audioRef.current.currentTime = ratio * (duration ?? 0);
                setCurrentTime(audioRef.current.currentTime);
              }
            }}
          >
            <div
              className="h-full bg-primary/70 transition-all duration-150"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-zinc-600 shrink-0 w-10 text-right">
            {duration ? formatDuration(duration) : "--:--"}
          </span>
        </div>
      )}
    </div>
  );
}

export function SunoMusicPlayer({ template }: SunoMusicPlayerProps) {
  const [state, setState] = useState<GenerateState>({ phase: "idle" });
  const [expanded, setExpanded] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoaded, setCreditsLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    callCredits().then((c) => {
      setCredits(c);
      setCreditsLoaded(true);
    });
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollStatus = useCallback(async (taskId: string) => {
    const elapsed = Date.now() - startTimeRef.current;
    if (elapsed > POLL_MAX_MS) {
      setState({ phase: "error", message: "Generation timed out after 5 minutes." });
      stopPolling();
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await callStatus(taskId, ctrl.signal);
      if (result.status === "completed" && result.tracks?.length) {
        stopPolling();
        setState({ phase: "done", taskId, tracks: result.tracks });
        callCredits().then(setCredits);
        return;
      }
      if (result.status === "failed") {
        stopPolling();
        setState({ phase: "error", message: result.error ?? "Generation failed on Suno's end." });
        return;
      }
      pollTimerRef.current = setTimeout(() => pollStatus(taskId), POLL_INTERVAL_MS);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      stopPolling();
      setState({ phase: "error", message: (err as Error).message });
    }
  }, [stopPolling]);

  const handleGenerate = useCallback(async () => {
    stopPolling();
    setState({ phase: "submitting" });
    startTimeRef.current = Date.now();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const result = await callGenerate(template, ctrl.signal);
      if (result.status === "completed" && result.tracks?.length) {
        setState({ phase: "done", taskId: result.taskId, tracks: result.tracks });
        callCredits().then(setCredits);
        return;
      }
      setState({ phase: "polling", taskId: result.taskId, elapsed: 0 });
      elapsedTimerRef.current = setInterval(() => {
        setState((prev) =>
          prev.phase === "polling"
            ? { ...prev, elapsed: Date.now() - startTimeRef.current }
            : prev
        );
      }, 1000);
      pollTimerRef.current = setTimeout(() => pollStatus(result.taskId), POLL_INTERVAL_MS);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({ phase: "error", message: (err as Error).message });
    }
  }, [template, stopPolling, pollStatus]);

  const handleCancel = useCallback(() => {
    stopPolling();
    setState({ phase: "idle" });
  }, [stopPolling]);

  const handleRetry = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  const isKeyMissing =
    state.phase === "error" && state.message.includes("SUNOAPI_KEY");

  return (
    <div className="w-full max-w-5xl mx-auto mt-4">
      <div className="bg-card border border-primary/20">
        {/* Header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-primary/3 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Music4 className="w-4 h-4 text-primary/70 shrink-0" />
            <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">
              Generate in Suno
            </span>
            {state.phase === "done" && (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
            )}
            {state.phase === "polling" && (
              <Loader2 className="w-3.5 h-3.5 text-primary/60 animate-spin shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {creditsLoaded && credits !== null && (
              <span className="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
                <Coins className="w-3 h-3 text-primary/40" />
                {credits} credits
              </span>
            )}
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-zinc-600" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
            )}
          </div>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-1 border-t border-primary/10 space-y-3">
                {/* Idle — show template summary + generate button */}
                {state.phase === "idle" && (
                  <div className="space-y-3">
                    <div className="text-[11px] font-mono text-zinc-500 space-y-0.5">
                      <p>
                        <span className="text-zinc-400">Model:</span>{" "}
                        <span className="text-primary/70">Suno V5.5</span>
                        {" · "}
                        <span className="text-zinc-400">Style:</span>{" "}
                        <span className="text-zinc-300">{template.styleOfMusic.slice(0, 60)}{template.styleOfMusic.length > 60 ? "…" : ""}</span>
                      </p>
                      <p>
                        <span className="text-zinc-400">Title:</span>{" "}
                        <span className="text-zinc-300">{template.title}</span>
                        {" · "}
                        <span className="text-zinc-400">Lyrics:</span>{" "}
                        <span className="text-zinc-300">{template.lyrics.length} chars</span>
                      </p>
                    </div>
                    <button
                      onClick={handleGenerate}
                      className="flex items-center gap-2 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider border border-primary bg-primary text-black hover:bg-primary/90 transition-all"
                    >
                      <Music4 className="w-3.5 h-3.5" />
                      Generate Song
                    </button>
                    <p className="font-mono text-[10px] text-zinc-600">
                      Each generation produces 2 tracks and consumes credits from your sunoapi.org account.
                    </p>
                  </div>
                )}

                {/* Submitting */}
                {state.phase === "submitting" && (
                  <div className="flex items-center gap-2 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="font-mono text-[11px] text-primary/60">
                      Submitting to Suno…
                    </span>
                  </div>
                )}

                {/* Polling */}
                {state.phase === "polling" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                      <div className="flex-1">
                        <span className="font-mono text-[11px] text-primary/60">
                          Suno is composing your song…{" "}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-600">
                          ({formatElapsed(state.elapsed)})
                        </span>
                      </div>
                    </div>
                    {/* Animated progress bar */}
                    <div className="w-full h-0.5 bg-zinc-800 overflow-hidden">
                      <motion.div
                        className="h-full bg-primary/60"
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      />
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-600">
                      <span>Task ID: <span className="text-zinc-500">{state.taskId}</span></span>
                    </div>
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-1.5 px-3 py-1 font-mono text-[11px] border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-400 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Done */}
                {state.phase === "done" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      <span className="font-mono text-[11px] text-green-400">
                        {state.tracks.length} track{state.tracks.length !== 1 ? "s" : ""} generated
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {state.tracks.map((track, i) => (
                        <TrackCard key={track.id ?? i} track={track} />
                      ))}
                    </div>
                    <button
                      onClick={handleGenerate}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] border border-primary/25 text-zinc-400",
                        "hover:border-primary hover:text-primary transition-all"
                      )}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Generate Again
                    </button>
                  </div>
                )}

                {/* Error */}
                {state.phase === "error" && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-destructive">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-mono text-[11px]">{state.message}</p>
                        {isKeyMissing && (
                          <p className="font-mono text-[10px] text-zinc-600">
                            Add SUNOAPI_KEY in your Replit Secrets to enable music generation.
                          </p>
                        )}
                      </div>
                    </div>
                    {!isKeyMissing && (
                      <button
                        onClick={handleRetry}
                        className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] border border-primary/25 text-zinc-400 hover:border-primary hover:text-primary transition-all"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Try Again
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
