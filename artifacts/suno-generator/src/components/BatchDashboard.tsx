import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Music2,
} from "lucide-react";
import type { BatchTrackResult, SunoTemplate } from "@workspace/api-client-react";
import { TemplateResult } from "@/components/TemplateResult";
import { cn } from "@/lib/utils";

interface BatchDashboardProps {
  tracks: BatchTrackResult[];
  onRetry: (track: BatchTrackResult) => void;
  onUseTemplate: (template: SunoTemplate) => void;
  onRetryFailed?: () => void;
}

function statusLabel(status: BatchTrackResult["status"]): string {
  switch (status) {
    case "queued": return "Queued";
    case "analyzing": return "Analyzing";
    case "generating": return "Generating";
    case "done": return "Done";
    case "failed": return "Failed";
    default: return "Unknown";
  }
}

function StatusBadge({ status }: { status: BatchTrackResult["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border",
        status === "done" && "border-primary/40 text-primary bg-primary/5",
        status === "failed" && "border-red-500/40 text-red-400 bg-red-500/5",
        status === "generating" && "border-yellow-400/40 text-yellow-300 bg-yellow-400/5",
        status === "analyzing" && "border-blue-400/40 text-blue-300 bg-blue-400/5",
        status === "queued" && "border-zinc-600/40 text-zinc-500 bg-zinc-600/5",
      )}
    >
      {status === "done" && <CheckCircle2 className="w-2.5 h-2.5" />}
      {status === "failed" && <XCircle className="w-2.5 h-2.5" />}
      {(status === "generating" || status === "analyzing") && (
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
      )}
      {status === "queued" && <Clock className="w-2.5 h-2.5" />}
      {statusLabel(status)}
    </span>
  );
}

function TrackCard({
  track,
  onRetry,
  onUseTemplate,
}: {
  track: BatchTrackResult;
  onRetry: (t: BatchTrackResult) => void;
  onUseTemplate: (t: SunoTemplate) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="border border-zinc-800 bg-card"
    >
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3",
          track.status === "done" && "cursor-pointer hover:bg-zinc-900/50 transition-colors",
        )}
        onClick={() => track.status === "done" && setExpanded((e) => !e)}
      >
        {track.thumbnail ? (
          <img
            src={track.thumbnail}
            alt={track.title ?? "track thumbnail"}
            className="w-14 h-10 object-cover flex-shrink-0 border border-zinc-700"
          />
        ) : (
          <div className="w-14 h-10 flex-shrink-0 bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <Music2 className="w-4 h-4 text-zinc-600" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-mono text-[12px] text-zinc-200 truncate leading-snug">
            {track.title ?? track.url}
          </p>
          {track.status === "failed" && track.error && (
            <p className="font-mono text-[10px] text-red-400/80 truncate mt-0.5">{track.error}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={track.status} />

          {track.status === "failed" && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRetry(track); }}
              className="flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest border border-zinc-700 text-zinc-400 hover:border-primary/50 hover:text-primary transition-all"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              Retry
            </button>
          )}

          {track.status === "done" && track.template && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUseTemplate(track.template!); }}
              className="flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest border border-primary/30 text-primary/70 hover:border-primary hover:text-primary transition-all"
            >
              Use
            </button>
          )}

          {track.status === "done" && (
            <span className="text-zinc-600">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && track.template && (
          <motion.div
            key="template"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-zinc-800"
          >
            <div className="p-4">
              <TemplateResult
                template={track.template}
                regeneratingSection={null}
                onRegenerateSection={() => undefined}
                compact
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function downloadAllTemplates(tracks: BatchTrackResult[]) {
  const done = tracks.filter((t) => t.status === "done" && t.template);
  if (done.length === 0) return;

  const lines = done.map((t, i) => {
    const tmpl = t.template!;
    return [
      `${"═".repeat(60)}`,
      `TRACK ${i + 1}: ${tmpl.songTitle} — ${tmpl.artist}`,
      `Source: ${t.url}`,
      `${"═".repeat(60)}`,
      ``,
      `[STYLE OF MUSIC]`,
      tmpl.styleOfMusic,
      ``,
      `[TITLE]`,
      tmpl.title,
      ``,
      `[NEGATIVE PROMPT]`,
      tmpl.negativePrompt,
      ``,
      `[LYRICS]`,
      tmpl.lyrics,
      ``,
    ].join("\n");
  });

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `suno-batch-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBatchCsv(tracks: BatchTrackResult[]) {
  const rows = [
    ["index", "status", "title", "artist", "url", "error"].join(","),
    ...tracks.map((t) => [
      String(t.index),
      t.status,
      `"${(t.template?.songTitle ?? t.title ?? "").replace(/"/g, '""')}"`,
      `"${(t.template?.artist ?? "").replace(/"/g, '""')}"`,
      `"${t.url.replace(/"/g, '""')}"`,
      `"${(t.error ?? "").replace(/"/g, '""')}"`,
    ].join(",")),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `suno-batch-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BatchDashboard({ tracks, onRetry, onUseTemplate, onRetryFailed }: BatchDashboardProps) {
  const doneCount = tracks.filter((t) => t.status === "done").length;
  const failedCount = tracks.filter((t) => t.status === "failed").length;
  const activeCount = tracks.filter((t) => t.status === "analyzing" || t.status === "generating").length;
  const totalCount = tracks.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-zinc-400 uppercase tracking-wider">
            Batch Progress
          </span>
          <span className="font-mono text-[11px] text-primary">
            {doneCount}/{totalCount} done
          </span>
          {failedCount > 0 && (
            <span className="font-mono text-[11px] text-red-400">
              {failedCount} failed
            </span>
          )}
          {activeCount > 0 && (
            <span className="flex items-center gap-1 font-mono text-[11px] text-yellow-300">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              {activeCount} processing
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={doneCount === 0}
          onClick={() => downloadAllTemplates(tracks)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
            doneCount > 0
              ? "border-primary/30 text-primary hover:border-primary hover:bg-primary/5"
              : "border-zinc-700 text-zinc-600 cursor-not-allowed opacity-50",
          )}
        >
          <Download className="w-3 h-3" />
          Download All ({doneCount})
        </button>
        <button
          type="button"
          onClick={() => downloadBatchCsv(tracks)}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-primary/20 text-zinc-400 hover:border-primary/50 hover:text-primary transition-all"
        >
          <Download className="w-3 h-3" />
          CSV
        </button>
        {failedCount > 0 && onRetryFailed && (
          <button
            type="button"
            onClick={onRetryFailed}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-red-500/30 text-red-400 hover:border-red-500 transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Retry Failed ({failedCount})
          </button>
        )}
      </div>

      <div className="w-full h-1 bg-zinc-800">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${totalCount > 0 ? (doneCount + failedCount) / totalCount * 100 : 0}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {tracks.map((track) => (
            <TrackCard
              key={track.index}
              track={track}
              onRetry={onRetry}
              onUseTemplate={onUseTemplate}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
