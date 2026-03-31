import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Music2, RotateCcw, Check, Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LyricsStructure, LyricsSection } from "@workspace/api-client-react";

export interface ConfirmedSection {
  label: string;
  lines: string[];
}

interface LyricsStructurePanelProps {
  structure: LyricsStructure;
  onConfirm: (sections: ConfirmedSection[]) => void;
  onClear: () => void;
  isLocked: boolean;
}

function sentimentColor(score: number): string {
  if (score >= 0.3) return "text-emerald-400";
  if (score >= 0) return "text-zinc-400";
  if (score >= -0.3) return "text-amber-400";
  return "text-rose-400";
}

function sentimentLabel(score: number): string {
  if (score >= 0.4) return "uplifting";
  if (score >= 0.1) return "hopeful";
  if (score >= -0.1) return "neutral";
  if (score >= -0.4) return "tense";
  return "dark";
}

function SentimentArc({ arc }: { arc: number[] }) {
  if (arc.length < 2) return null;
  const W = 280;
  const H = 36;
  const padX = 8;
  const padY = 6;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const points = arc.map((v, i) => {
    const x = padX + (i / (arc.length - 1)) * innerW;
    const norm = (v + 1) / 2;
    const y = padY + (1 - norm) * innerH;
    return [x, y] as [number, number];
  });

  const path = points
    .map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`))
    .join(" ");

  const midY = padY + innerH / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-9 mt-1" preserveAspectRatio="none">
      <line x1={padX} y1={midY} x2={W - padX} y2={midY} stroke="hsl(188 100% 50% / 0.1)" strokeWidth="1" />
      <path d={path} fill="none" stroke="hsl(188 100% 50% / 0.6)" strokeWidth="1.5" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill="hsl(188 100% 50% / 0.8)" />
      ))}
    </svg>
  );
}

function SectionPill({
  section,
  index,
  onLabelChange,
  onRemove,
  canRemove,
}: {
  section: LyricsSection;
  index: number;
  onLabelChange: (index: number, newLabel: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.label);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== section.label) {
      onLabelChange(index, trimmed);
    } else {
      setDraft(section.label);
    }
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-2.5 border transition-all group",
        section.isHook
          ? "border-primary/30 bg-primary/5"
          : "border-primary/10 bg-card"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") { setDraft(section.label); setEditing(false); }
              }}
              className="font-mono text-[11px] text-primary bg-transparent border-b border-primary/50 focus:outline-none w-28"
            />
          ) : (
            <button
              type="button"
              onClick={() => { setDraft(section.label); setEditing(true); }}
              className="font-mono text-[11px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
              title="Click to rename section"
            >
              {section.label}
              <Pencil className="w-2.5 h-2.5 opacity-40 ml-0.5" />
            </button>
          )}

          {section.isHook && (
            <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/30">
              HOOK
            </span>
          )}

          {section.rhymeScheme && section.rhymeScheme !== "-" && (
            <span className="font-mono text-[9px] uppercase tracking-widest px-1 py-0.5 bg-zinc-800 text-zinc-500 border border-zinc-700">
              {section.rhymeScheme.slice(0, 8)}
            </span>
          )}

          <span className={cn("font-mono text-[9px]", sentimentColor(section.sentiment))}>
            {sentimentLabel(section.sentiment)}
          </span>
        </div>

        <p className="font-mono text-[10px] text-zinc-600 mt-1">
          {section.lines.filter((l) => l.trim()).length} lines
        </p>
      </div>

      {canRemove && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-700 hover:text-rose-400 transition-all shrink-0"
          title="Remove section"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

const SECTION_LABEL_PRESETS = [
  "Verse", "Pre-Chorus", "Chorus", "Bridge", "Outro", "Intro",
  "Hook", "Breakdown", "Build", "Drop", "Interlude", "Coda",
];

export function LyricsStructurePanel({
  structure,
  onConfirm,
  onClear,
  isLocked,
}: LyricsStructurePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [sections, setSections] = useState<LyricsSection[]>(structure.sections);
  const [addingLabel, setAddingLabel] = useState<string | null>(null);

  useEffect(() => {
    setSections(structure.sections);
    setAddingLabel(null);
  }, [structure]);

  const handleLabelChange = (index: number, newLabel: string) => {
    setSections((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], label: newLabel };
      return next;
    });
  };

  const handleRemove = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddSection = (label: string) => {
    const newSection: LyricsSection = {
      label,
      lines: [],
      rhymeScheme: "-",
      sentiment: 0,
      isHook: label.toLowerCase().includes("chorus") || label.toLowerCase().includes("hook"),
      repetitionKey: label.toLowerCase().replace(/\s+/g, "_"),
    };
    setSections((prev) => [...prev, newSection]);
    setAddingLabel(null);
  };

  const handleReset = () => {
    setSections(structure.sections);
    setAddingLabel(null);
  };

  const hasChanges =
    sections.length !== structure.sections.length ||
    sections.some((s, i) => s.label !== structure.sections[i]?.label);

  const confirmPayload: ConfirmedSection[] = sections.map((s) => ({
    label: s.label,
    lines: s.lines,
  }));

  return (
    <div className="border border-primary/15 bg-card mt-4 max-w-6xl mx-auto">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-primary/3 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Music2 className="w-3.5 h-3.5 text-primary/60" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-400">
            Lyrics Structure
          </span>
          <span className="font-mono text-[10px] text-zinc-600">
            · {sections.length} sections
            {structure.hookRepetitions > 1 ? ` · hook ×${structure.hookRepetitions}` : ""}
            {structure.dominantScheme !== "-" ? ` · ${structure.dominantScheme} scheme` : ""}
          </span>
          {isLocked && (
            <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/30">
              LOCKED
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-zinc-600 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-primary/10 pt-3">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] text-zinc-600">
                  {structure.hasTaggedStructure
                    ? "Structure detected from section tags"
                    : "Structure estimated from blank-line separation"}
                  {" · "}Click a label to rename · hover to remove.
                </p>
                {hasChanges && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex items-center gap-1 font-mono text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {sections.map((section, i) => (
                  <SectionPill
                    key={i}
                    section={section}
                    index={i}
                    onLabelChange={isLocked ? () => {} : handleLabelChange}
                    onRemove={handleRemove}
                    canRemove={!isLocked && sections.length > 1}
                  />
                ))}

                {/* Add section button — hidden when locked */}
                {isLocked && null}
                {!isLocked && <div className="border border-dashed border-primary/15 bg-transparent flex items-center justify-center">
                  {addingLabel === null ? (
                    <button
                      type="button"
                      onClick={() => setAddingLabel("")}
                      className="w-full h-full min-h-[3.5rem] flex flex-col items-center justify-center gap-1 text-zinc-700 hover:text-primary/60 hover:border-primary/30 transition-colors"
                      title="Add a section"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="font-mono text-[9px] uppercase tracking-widest">Add section</span>
                    </button>
                  ) : (
                    <div className="p-2 w-full space-y-1.5">
                      <div className="flex flex-wrap gap-1">
                        {SECTION_LABEL_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleAddSection(preset)}
                            className="font-mono text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 hover:bg-primary/20 hover:text-primary border border-zinc-700 hover:border-primary/30 transition-colors"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <input
                          autoFocus
                          value={addingLabel}
                          onChange={(e) => setAddingLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && addingLabel.trim()) handleAddSection(addingLabel.trim());
                            if (e.key === "Escape") setAddingLabel(null);
                          }}
                          placeholder="Custom label…"
                          className="flex-1 font-mono text-[10px] bg-transparent border-b border-primary/30 focus:outline-none text-primary placeholder-zinc-700 min-w-0"
                        />
                        {addingLabel.trim() && (
                          <button
                            type="button"
                            onClick={() => handleAddSection(addingLabel.trim())}
                            className="font-mono text-[9px] text-primary hover:text-primary/80 px-1 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setAddingLabel(null)}
                          className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 px-1 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>}
              </div>

              {structure.sentimentArc.length >= 2 && (
                <div>
                  <p className="font-mono text-[10px] text-zinc-700 mb-1">Sentiment arc</p>
                  <SentimentArc arc={structure.sentimentArc} />
                  <div className="flex justify-between font-mono text-[9px] text-zinc-700 mt-0.5">
                    <span>Intro</span>
                    <span>Outro</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1 border-t border-primary/10">
                {isLocked ? (
                  <button
                    type="button"
                    onClick={onClear}
                    className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-primary/20 text-zinc-500 hover:border-destructive/40 hover:text-destructive transition-all"
                  >
                    <RotateCcw className="w-3 h-3" /> Unlock structure
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onConfirm(confirmPayload)}
                    className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-primary/30 text-primary hover:bg-primary/10 transition-all"
                  >
                    <Check className="w-3 h-3" /> Lock for regeneration
                  </button>
                )}
                <p className="font-mono text-[10px] text-zinc-700">
                  {isLocked
                    ? "AI will use this structure on next generation"
                    : "Lock to use this section layout when you regenerate"}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
