import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, Clock, RotateCcw, ChevronDown, ChevronUp, Diff, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TemplateSnapshot {
  id: string;
  timestamp: number;
  label: string;
  template: {
    songTitle: string;
    styleOfMusic: string;
    lyrics: string;
    negativePrompt: string;
  };
}

interface TemplateVersionControlProps {
  currentTemplate: {
    songTitle: string;
    styleOfMusic: string;
    lyrics: string;
    negativePrompt: string;
  } | null;
  onRestoreSnapshot: (snapshot: TemplateSnapshot["template"]) => void;
  className?: string;
}

const STORAGE_KEY = "suno-template-versions";
const MAX_VERSIONS = 20;

function loadVersions(): TemplateSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveVersions(versions: TemplateSnapshot[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
  } catch {}
}

function diffLines(a: string, b: string): Array<{ type: "same" | "added" | "removed"; text: string }> {
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  const result: Array<{ type: "same" | "added" | "removed"; text: string }> = [];

  // Simple LCS-based diff (limited to first 30 lines for performance)
  const maxLines = 30;
  const la = linesA.slice(0, maxLines);
  const lb = linesB.slice(0, maxLines);

  let i = 0, j = 0;
  while (i < la.length || j < lb.length) {
    if (i >= la.length) {
      result.push({ type: "added", text: lb[j++] });
    } else if (j >= lb.length) {
      result.push({ type: "removed", text: la[i++] });
    } else if (la[i] === lb[j]) {
      result.push({ type: "same", text: la[i] });
      i++; j++;
    } else {
      result.push({ type: "removed", text: la[i++] });
      result.push({ type: "added", text: lb[j++] });
    }
  }
  return result;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function DiffView({ fieldLabel, oldText, newText }: { fieldLabel: string; oldText: string; newText: string }) {
  const [show, setShow] = useState(false);
  const lines = diffLines(oldText, newText);
  const changes = lines.filter((l) => l.type !== "same").length;

  if (changes === 0) return (
    <div className="px-2 py-1 border border-zinc-800">
      <span className="font-mono text-[9px] text-zinc-600">{fieldLabel}: <span className="text-zinc-700">no changes</span></span>
    </div>
  );

  return (
    <div className="border border-zinc-800">
      <button
        onClick={() => setShow((v) => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-zinc-900/50 transition-colors"
      >
        <span className="font-mono text-[9px] text-zinc-400">{fieldLabel}</span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[8px] text-green-500">+{lines.filter((l) => l.type === "added").length}</span>
          <span className="font-mono text-[8px] text-red-500">-{lines.filter((l) => l.type === "removed").length}</span>
          {show ? <ChevronUp className="w-3 h-3 text-zinc-600" /> : <ChevronDown className="w-3 h-3 text-zinc-600" />}
        </div>
      </button>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-40 overflow-y-auto border-t border-zinc-800 bg-zinc-950">
              {lines.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-2 py-px font-mono text-[9px] leading-relaxed",
                    line.type === "added" && "bg-green-500/10 text-green-400",
                    line.type === "removed" && "bg-red-500/10 text-red-400 line-through opacity-60",
                    line.type === "same" && "text-zinc-700"
                  )}
                >
                  <span className="mr-1.5 opacity-50">{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}</span>
                  {line.text || " "}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TemplateVersionControl({ currentTemplate, onRestoreSnapshot, className }: TemplateVersionControlProps) {
  const [versions, setVersions] = useState<TemplateSnapshot[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState<string | null>(null);

  useEffect(() => {
    setVersions(loadVersions());
  }, []);

  // Save current template as a new version when it changes
  const saveVersion = useCallback((template: NonNullable<typeof currentTemplate>, label?: string) => {
    const snapshot: TemplateSnapshot = {
      id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      label: label ?? `Version — ${template.songTitle || "Untitled"}`,
      template,
    };
    setVersions((prev) => {
      const updated = [snapshot, ...prev].slice(0, MAX_VERSIONS);
      saveVersions(updated);
      return updated;
    });
    return snapshot.id;
  }, []);

  // Auto-save when currentTemplate changes (debounced via key check)
  useEffect(() => {
    if (!currentTemplate?.styleOfMusic) return;
    const existing = versions[0];
    if (existing && existing.template.styleOfMusic === currentTemplate.styleOfMusic && existing.template.lyrics === currentTemplate.lyrics) return;
    // Only auto-save if there's meaningful content
    if (currentTemplate.styleOfMusic.length < 20) return;
    saveVersion(currentTemplate, `Auto — ${currentTemplate.songTitle || "Untitled"}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTemplate?.styleOfMusic, currentTemplate?.lyrics]);

  const deleteVersion = (id: string) => {
    setVersions((prev) => {
      const updated = prev.filter((v) => v.id !== id);
      saveVersions(updated);
      return updated;
    });
    if (selectedId === id) setSelectedId(null);
    if (showDiff === id) setShowDiff(null);
  };

  const clearAll = () => {
    setVersions([]);
    saveVersions([]);
    setSelectedId(null);
    setShowDiff(null);
  };

  const selectedVersion = versions.find((v) => v.id === selectedId) ?? null;
  const diffVersion = versions.find((v) => v.id === showDiff) ?? null;

  return (
    <div className={cn("border border-primary/20 overflow-hidden", className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-primary/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-primary/50" />
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">Version History</span>
          {versions.length > 0 && (
            <span className="font-mono text-[9px] text-zinc-600">{versions.length} snapshot{versions.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-primary/10">
              {versions.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="font-mono text-[11px] text-zinc-600">No versions saved yet.</p>
                  <p className="font-mono text-[10px] text-zinc-700 mt-1">Versions are auto-saved when you generate templates.</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-900">
                  {/* Version list */}
                  <div className="max-h-48 overflow-y-auto">
                    {versions.map((v, i) => (
                      <div
                        key={v.id}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-900/40 transition-colors cursor-pointer",
                          selectedId === v.id && "bg-primary/5 border-l-2 border-l-primary"
                        )}
                        onClick={() => setSelectedId(selectedId === v.id ? null : v.id)}
                      >
                        <div className="flex items-center gap-1.5 shrink-0">
                          {i === 0 ? (
                            <span className="font-mono text-[8px] px-1 py-0.5 bg-primary/20 text-primary border border-primary/30">HEAD</span>
                          ) : (
                            <span className="font-mono text-[8px] text-zinc-700 w-8">v{versions.length - i}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-[10px] text-zinc-300 truncate">{v.label}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Clock className="w-2.5 h-2.5 text-zinc-700" />
                            <span className="font-mono text-[8px] text-zinc-600">{formatTimestamp(v.timestamp)}</span>
                            <span className="font-mono text-[8px] text-zinc-700">· {v.template.styleOfMusic.length}c style</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowDiff(showDiff === v.id ? null : v.id); }}
                            title="View diff vs current"
                            className={cn(
                              "p-1 border transition-colors font-mono text-[8px]",
                              showDiff === v.id ? "border-primary/40 text-primary" : "border-zinc-800 text-zinc-600 hover:border-zinc-600"
                            )}
                          >
                            <Diff className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onRestoreSnapshot(v.template); }}
                            title="Restore this version"
                            className="p-1 border border-zinc-800 text-zinc-600 hover:border-primary/40 hover:text-primary transition-colors"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteVersion(v.id); }}
                            title="Delete this version"
                            className="p-1 border border-zinc-800 text-zinc-700 hover:border-red-500/30 hover:text-red-500 transition-colors"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Diff view */}
                  <AnimatePresence>
                    {showDiff && diffVersion && currentTemplate && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 py-3 space-y-2">
                          <div className="flex items-center gap-2 mb-2">
                            <Diff className="w-3 h-3 text-zinc-500" />
                            <span className="font-mono text-[9px] text-zinc-500">Diff: {diffVersion.label} vs current</span>
                          </div>
                          <DiffView
                            fieldLabel="Style of Music"
                            oldText={diffVersion.template.styleOfMusic}
                            newText={currentTemplate.styleOfMusic}
                          />
                          <DiffView
                            fieldLabel="Lyrics"
                            oldText={diffVersion.template.lyrics}
                            newText={currentTemplate.lyrics}
                          />
                          <DiffView
                            fieldLabel="Negative Prompt"
                            oldText={diffVersion.template.negativePrompt}
                            newText={currentTemplate.negativePrompt}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Footer actions */}
                  <div className="px-4 py-2 flex items-center justify-between">
                    <span className="font-mono text-[9px] text-zinc-700">Auto-saves on every generation · Max {MAX_VERSIONS}</span>
                    <button
                      onClick={clearAll}
                      className="font-mono text-[9px] text-zinc-700 hover:text-red-500 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
