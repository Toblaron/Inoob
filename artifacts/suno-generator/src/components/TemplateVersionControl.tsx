import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, Clock, RotateCcw, ChevronDown, ChevronUp, Trash2, Plus, GitCompare, FileJson } from "lucide-react";
import type { SunoTemplate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const VERSION_KEY = "suno-template-versions";
const MAX_VERSIONS = 20;

export interface TemplateVersion {
  id: string;
  label: string;
  template: SunoTemplate;
  savedAt: number;
  isAuto: boolean; // auto-saved vs manually named
  note?: string;
}

function loadVersions(songKey: string): TemplateVersion[] {
  try {
    const raw = localStorage.getItem(`${VERSION_KEY}:${songKey}`);
    return raw ? (JSON.parse(raw) as TemplateVersion[]) : [];
  } catch {
    return [];
  }
}

function saveVersions(songKey: string, versions: TemplateVersion[]) {
  try {
    localStorage.setItem(
      `${VERSION_KEY}:${songKey}`,
      JSON.stringify(versions.slice(0, MAX_VERSIONS))
    );
  } catch {}
}

function songKey(template: SunoTemplate): string {
  return `${template.artist}::${template.songTitle}`.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9:-]/g, "");
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 7);
}

function diffSummary(a: SunoTemplate, b: SunoTemplate): string[] {
  const changes: string[] = [];
  if (a.styleOfMusic !== b.styleOfMusic) {
    const lenDiff = b.styleOfMusic.length - a.styleOfMusic.length;
    changes.push(`Style: ${lenDiff > 0 ? "+" : ""}${lenDiff} chars`);
  }
  if (a.lyrics !== b.lyrics) {
    const lenDiff = b.lyrics.length - a.lyrics.length;
    changes.push(`Lyrics: ${lenDiff > 0 ? "+" : ""}${lenDiff} chars`);
  }
  if (a.negativePrompt !== b.negativePrompt) {
    changes.push("Negative prompt changed");
  }
  if (a.title !== b.title) {
    changes.push("Title changed");
  }
  return changes;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

interface VersionRowProps {
  version: TemplateVersion;
  prevVersion: TemplateVersion | null;
  isCurrent: boolean;
  onRestore: (v: TemplateVersion) => void;
  onDelete: (id: string) => void;
  onExport: (v: TemplateVersion) => void;
}

function VersionRow({ version, prevVersion, isCurrent, onRestore, onDelete, onExport }: VersionRowProps) {
  const [showDiff, setShowDiff] = useState(false);
  const changes = prevVersion ? diffSummary(prevVersion.template, version.template) : [];

  return (
    <div className={cn(
      "border-b border-primary/8 last:border-0",
      isCurrent && "bg-primary/4"
    )}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className={cn(
          "w-2 h-2 rounded-full shrink-0",
          isCurrent ? "bg-primary" : "bg-zinc-700"
        )} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "font-mono text-[11px] truncate",
              isCurrent ? "text-primary" : "text-zinc-300"
            )}>
              {version.label}
            </span>
            {isCurrent && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 border border-primary/30 text-primary/70 uppercase tracking-wider">
                current
              </span>
            )}
            {version.isAuto && (
              <span className="font-mono text-[9px] text-zinc-600">auto</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Clock className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
            <span className="font-mono text-[10px] text-zinc-600">{timeAgo(version.savedAt)}</span>
            {changes.length > 0 && (
              <button
                onClick={() => setShowDiff((v) => !v)}
                className="flex items-center gap-0.5 font-mono text-[10px] text-zinc-600 hover:text-cyan-400 transition-colors"
              >
                <GitCompare className="w-2.5 h-2.5" />
                {changes.length} change{changes.length !== 1 ? "s" : ""}
                {showDiff ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
              </button>
            )}
          </div>
          {version.note && (
            <p className="font-mono text-[10px] text-zinc-500 mt-1">{version.note}</p>
          )}
          <AnimatePresence>
            {showDiff && changes.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-1.5 space-y-0.5">
                  {changes.map((c, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="text-cyan-500 font-mono text-[9px]">~</span>
                      <span className="font-mono text-[9px] text-zinc-500">{c}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {!isCurrent && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onRestore(version)}
              title="Restore this version"
              className="flex items-center gap-1 px-2 py-1 font-mono text-[9px] uppercase tracking-wider border border-primary/20 text-zinc-500 hover:border-primary/50 hover:text-primary transition-all"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Restore
            </button>
            <button
              onClick={() => onDelete(version.id)}
              title="Delete this version"
              className="p-1 text-zinc-700 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => onExport(version)}
              title="Export this version as JSON"
              className="p-1 text-zinc-700 hover:text-primary transition-colors"
            >
              <FileJson className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface TemplateVersionControlProps {
  template: SunoTemplate;
  onRestore: (template: SunoTemplate) => void;
}

export function TemplateVersionControl({ template, onRestore }: TemplateVersionControlProps) {
  const [expanded, setExpanded] = useState(false);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const key = songKey(template);

  // Load versions on mount and when key changes
  useEffect(() => {
    setVersions(loadVersions(key));
  }, [key]);

  // Auto-save when template changes (if no identical version already exists)
  useEffect(() => {
    const existing = loadVersions(key);
    const last = existing[0];
    if (last && last.template.styleOfMusic === template.styleOfMusic &&
      last.template.lyrics === template.lyrics &&
      last.template.negativePrompt === template.negativePrompt) {
      return; // No change
    }
    const newVersion: TemplateVersion = {
      id: shortId(),
      label: `Auto-save ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      template,
      savedAt: Date.now(),
      isAuto: true,
    };
    const updated = [newVersion, ...existing].slice(0, MAX_VERSIONS);
    saveVersions(key, updated);
    setVersions(updated);
  }, [template, key]);

  const handleSaveNamed = useCallback(() => {
    if (!customLabel.trim()) return;
    const newVersion: TemplateVersion = {
      id: shortId(),
      label: customLabel.trim(),
      template,
      savedAt: Date.now(),
      isAuto: false,
      note: customNote.trim() || undefined,
    };
    const updated = [newVersion, ...versions].slice(0, MAX_VERSIONS);
    saveVersions(key, updated);
    setVersions(updated);
    setCustomLabel("");
    setCustomNote("");
    setShowSaveInput(false);
  }, [customLabel, customNote, template, versions, key]);

  const handleDelete = useCallback((id: string) => {
    const updated = versions.filter((v) => v.id !== id);
    saveVersions(key, updated);
    setVersions(updated);
  }, [versions, key]);

  const handleRestore = useCallback((v: TemplateVersion) => {
    onRestore(v.template);
  }, [onRestore]);

  const handleClearAll = useCallback(() => {
    saveVersions(key, []);
    setVersions([]);
  }, [key]);

  const handleExport = useCallback((version: TemplateVersion) => {
    const blob = new Blob([JSON.stringify(version, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${version.label.replace(/[/\\?%*:|"<>]/g, "").trim() || "template-version"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (versions.length === 0) return null;

  return (
    <div className="w-full bg-card border border-primary/12 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-primary/3 transition-colors"
      >
        <GitBranch className="w-3.5 h-3.5 text-primary/50 shrink-0" />
        <span className="flex-1 font-mono text-[10px] text-primary/50 uppercase tracking-widest">
          Version History
        </span>
        <span className="font-mono text-[10px] text-zinc-600 mr-1">
          {versions.length} version{versions.length !== 1 ? "s" : ""}
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
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
            <div className="border-t border-primary/10">
              {/* Save named version */}
              <div className="px-3 py-2 border-b border-primary/8 flex items-center gap-2">
                {showSaveInput ? (
                  <>
                    <input
                      autoFocus
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveNamed();
                        if (e.key === "Escape") setShowSaveInput(false);
                      }}
                      placeholder="Name this version..."
                      className="flex-1 bg-zinc-900 border border-primary/20 px-2 py-1 font-mono text-[11px] text-zinc-300 focus:outline-none focus:border-primary/50"
                    />
                    <input
                      value={customNote}
                      onChange={(e) => setCustomNote(e.target.value)}
                      placeholder="Optional note..."
                      className="flex-1 bg-zinc-900 border border-primary/20 px-2 py-1 font-mono text-[11px] text-zinc-300 focus:outline-none focus:border-primary/50"
                    />
                    <button
                      onClick={handleSaveNamed}
                      disabled={!customLabel.trim()}
                      className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-30 transition-all"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowSaveInput(false)}
                      className="font-mono text-[10px] text-zinc-600 hover:text-zinc-400 px-1"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setShowSaveInput(true)}
                      className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-primary transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Save named version
                    </button>
                    <div className="flex-1" />
                    {versions.filter((v) => v.isAuto).length > 3 && (
                      <button
                        onClick={handleClearAll}
                        className="font-mono text-[10px] text-zinc-700 hover:text-red-400 transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Version list */}
              <div className="max-h-72 overflow-y-auto">
                {versions.map((v, i) => (
                  <VersionRow
                    key={v.id}
                    version={v}
                    prevVersion={versions[i + 1] ?? null}
                    isCurrent={i === 0}
                    onRestore={handleRestore}
                    onDelete={handleDelete}
                    onExport={handleExport}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
