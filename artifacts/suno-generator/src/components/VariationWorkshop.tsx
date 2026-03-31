import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  GitMerge,
  Diff,
  Music,
  Heading,
  Sparkles,
  Ban,
  ChevronDown,
  ChevronUp,
  Copy,
} from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { SunoTemplate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

type SectionKey = "styleOfMusic" | "title" | "lyrics" | "negativePrompt";

interface Selection {
  styleOfMusic: number;
  title: number;
  lyrics: number;
  negativePrompt: number;
}

interface VariationWorkshopProps {
  variations: SunoTemplate[];
  onMerge: (merged: SunoTemplate) => void;
  onClose: () => void;
}

function wordDiffTokens(
  base: string,
  changed: string
): Array<{ token: string; isNew: boolean }> {
  const baseSet = new Set(
    base
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean)
  );
  return changed.split(/(\s+|,+)/).map((token) => ({
    token,
    isNew: token.trim().length > 0 && !baseSet.has(token.toLowerCase().trim()),
  }));
}

function stringSimilarity(a: string, b: string): number {
  const aWords = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
  );
  const bWords = b
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (bWords.length === 0) return 100;
  const matches = bWords.filter((w) => aWords.has(w)).length;
  return Math.round((matches / bWords.length) * 100);
}

function DiffText({
  base,
  changed,
}: {
  base: string;
  changed: string;
}) {
  const tokens = wordDiffTokens(base, changed);
  return (
    <span>
      {tokens.map((t, i) =>
        t.isNew ? (
          <mark
            key={i}
            className="bg-amber-400/20 text-amber-300 not-italic rounded-sm px-0.5"
          >
            {t.token}
          </mark>
        ) : (
          <span key={i}>{t.token}</span>
        )
      )}
    </span>
  );
}

function VariationBadge({
  index,
  selected,
}: {
  index: number;
  selected: boolean;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] px-2 py-0.5 uppercase tracking-widest font-bold border",
        selected
          ? "bg-primary text-black border-primary"
          : "border-primary/30 text-primary/70"
      )}
    >
      V{index + 1}
    </span>
  );
}

interface SectionCardProps {
  variationIdx: number;
  isSelected: boolean;
  isReference: boolean;
  showDiff: boolean;
  referenceText: string;
  currentText: string;
  charCount?: number;
  charLimit?: number;
  charMin?: number;
  label: string;
  icon: React.ReactNode;
  preview?: string;
  onSelect: () => void;
}

function SectionCard({
  variationIdx,
  isSelected,
  isReference,
  showDiff,
  referenceText,
  currentText,
  charCount,
  charLimit,
  charMin,
  label,
  icon: _icon,
  preview,
  onSelect,
}: SectionCardProps) {
  const simPct =
    !isReference && showDiff
      ? stringSimilarity(referenceText, currentText)
      : null;

  const charOver = charLimit !== undefined && (charCount ?? 0) > charLimit;
  const charUnder = charMin !== undefined && (charCount ?? 0) < charMin;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative w-full text-left p-3 border transition-all group flex flex-col gap-2",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-primary/15 hover:border-primary/40 bg-card"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <VariationBadge index={variationIdx} selected={isSelected} />
          {isSelected && (
            <span className="flex items-center gap-0.5 font-mono text-[9px] text-primary uppercase tracking-wider">
              <Check className="w-2.5 h-2.5" /> Selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {simPct !== null && (
            <span
              className={cn(
                "font-mono text-[9px] px-1.5 py-0.5 border",
                simPct >= 80
                  ? "border-zinc-700 text-zinc-600"
                  : simPct >= 50
                    ? "border-amber-500/30 text-amber-500"
                    : "border-primary/30 text-primary/80"
              )}
              title={`${simPct}% words match V1`}
            >
              {simPct}% match
            </span>
          )}
          {charCount !== undefined && charLimit !== undefined && (
            <span
              className={cn(
                "font-mono text-[9px] px-1.5 py-0.5 border",
                charOver
                  ? "border-destructive/40 text-destructive"
                  : charUnder
                    ? "border-yellow-500/30 text-yellow-500"
                    : "border-primary/20 text-primary/50"
              )}
            >
              {charCount.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <div className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
        {label}
      </div>

      <div
        className={cn(
          "text-xs leading-relaxed break-words text-zinc-300 line-clamp-4",
          !isReference && showDiff ? "" : ""
        )}
      >
        {!isReference && showDiff ? (
          <DiffText base={referenceText} changed={preview ?? currentText} />
        ) : (
          <span>{preview ?? currentText}</span>
        )}
      </div>
    </button>
  );
}

interface SectionRowProps {
  sectionKey: SectionKey;
  label: string;
  icon: React.ReactNode;
  variations: SunoTemplate[];
  selected: number;
  showDiff: boolean;
  onSelect: (idx: number) => void;
  getText: (v: SunoTemplate) => string;
  getPreview?: (v: SunoTemplate) => string;
  charLimit?: number;
  charMin?: number;
  getCharCount?: (v: SunoTemplate) => number;
  collapsible?: boolean;
}

function SectionRow({
  sectionKey,
  label,
  icon,
  variations,
  selected,
  showDiff,
  onSelect,
  getText,
  getPreview,
  charLimit,
  charMin,
  getCharCount,
  collapsible = false,
}: SectionRowProps) {
  const [collapsed, setCollapsed] = useState(collapsible);
  const reference = variations[0];

  return (
    <div className="border border-primary/10 bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
        <span className="text-primary/40">{icon}</span>
        <span className="font-mono text-[11px] text-zinc-400 uppercase tracking-wider font-medium">
          {label}
        </span>
        {collapsible && (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="ml-auto p-0.5 text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {collapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key={`${sectionKey}-cards`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="overflow-x-auto"
              style={{ scrollbarWidth: "thin" }}
            >
              <div
                className="grid gap-2 p-2"
                style={{
                  gridTemplateColumns: `repeat(${variations.length}, minmax(240px, 1fr))`,
                  minWidth: `${variations.length * 250}px`,
                }}
              >
                {variations.map((v, i) => (
                  <SectionCard
                    key={i}
                    variationIdx={i}
                    isSelected={selected === i}
                    isReference={i === 0}
                    showDiff={showDiff}
                    referenceText={getText(reference)}
                    currentText={getText(v)}
                    charCount={getCharCount ? getCharCount(v) : undefined}
                    charLimit={charLimit}
                    charMin={charMin}
                    label={`Variation ${i + 1}`}
                    icon={null}
                    preview={getPreview ? getPreview(v) : undefined}
                    onSelect={() => onSelect(i)}
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

function CompositePanelSection({
  label,
  fromVariation,
  value,
  charCount,
  charLimit,
  charMin,
  mono = false,
}: {
  label: string;
  fromVariation: number;
  value: string;
  charCount?: number;
  charLimit?: number;
  charMin?: number;
  mono?: boolean;
}) {
  const charOver = charLimit !== undefined && (charCount ?? 0) > charLimit;
  const charUnder = charMin !== undefined && (charCount ?? 0) < charMin;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
          {label}
        </span>
        <span className="font-mono text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary/70 border border-primary/20">
          from V{fromVariation + 1}
        </span>
        {charCount !== undefined && (
          <span
            className={cn(
              "font-mono text-[9px] px-1.5 py-0.5 border ml-auto",
              charOver
                ? "border-destructive/40 text-destructive"
                : charUnder
                  ? "border-yellow-500/30 text-yellow-500"
                  : "border-primary/20 text-primary/50"
            )}
          >
            {charCount.toLocaleString()}
            {charLimit ? ` / ${charLimit.toLocaleString()}` : ""}
          </span>
        )}
      </div>
      <p
        className={cn(
          "text-xs text-zinc-300 leading-relaxed break-words line-clamp-3",
          mono ? "font-mono" : ""
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function VariationWorkshop({
  variations,
  onMerge,
  onClose,
}: VariationWorkshopProps) {
  const { copy } = useCopyToClipboard();
  const [showDiff, setShowDiff] = useState(true);
  const [selected, setSelected] = useState<Selection>({
    styleOfMusic: 0,
    title: 0,
    lyrics: 0,
    negativePrompt: 0,
  });

  const selectSection = (key: SectionKey, idx: number) => {
    setSelected((prev) => ({ ...prev, [key]: idx }));
  };

  const merged: SunoTemplate = {
    ...variations[0],
    styleOfMusic: variations[selected.styleOfMusic].styleOfMusic,
    title: variations[selected.title].title,
    lyrics: variations[selected.lyrics].lyrics,
    negativePrompt: variations[selected.negativePrompt].negativePrompt,
  };

  const anyNonDefault = Object.values(selected).some((v) => v !== 0);

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 bg-card border border-primary/20 px-5 py-3">
        <div>
          <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">
            Variation Workshop
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <h2 className="text-base font-bold text-white leading-tight">
              {variations[0].songTitle}
            </h2>
            <span className="font-mono text-[10px] text-zinc-600">
              {variations.length} variations
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDiff((v) => !v)}
            title="Toggle word-level diff highlighting vs V1"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
              showDiff
                ? "border-amber-500/40 text-amber-400 bg-amber-400/5"
                : "border-primary/20 text-zinc-500 hover:border-primary/40 hover:text-zinc-300"
            )}
          >
            <Diff className="w-3 h-3" />
            {showDiff ? "Diff On" : "Diff Off"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 border border-primary/15 text-zinc-500 hover:text-zinc-300 hover:border-primary/40 transition-all"
            aria-label="Close variation workshop"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showDiff && variations.length > 1 && (
        <p className="font-mono text-[10px] text-zinc-600 px-1">
          <span className="inline-block w-2 h-2 bg-amber-400/30 border border-amber-500/30 mr-1 align-middle" />
          Highlighted words are unique to that variation vs V1 (the reference)
        </p>
      )}

      {/* Section rows */}
      <SectionRow
        sectionKey="styleOfMusic"
        label="Style of Music"
        icon={<Music className="w-3.5 h-3.5" />}
        variations={variations}
        selected={selected.styleOfMusic}
        showDiff={showDiff}
        onSelect={(i) => selectSection("styleOfMusic", i)}
        getText={(v) => v.styleOfMusic}
        charLimit={900}
        getCharCount={(v) => v.styleOfMusic.length}
      />

      <SectionRow
        sectionKey="title"
        label="Suno Title"
        icon={<Heading className="w-3.5 h-3.5" />}
        variations={variations}
        selected={selected.title}
        showDiff={showDiff}
        onSelect={(i) => selectSection("title", i)}
        getText={(v) => v.title}
      />

      <SectionRow
        sectionKey="negativePrompt"
        label="Negative Prompt"
        icon={<Ban className="w-3.5 h-3.5" />}
        variations={variations}
        selected={selected.negativePrompt}
        showDiff={showDiff}
        onSelect={(i) => selectSection("negativePrompt", i)}
        getText={(v) => v.negativePrompt}
        charLimit={199}
        charMin={180}
        getCharCount={(v) => v.negativePrompt.length}
      />

      <SectionRow
        sectionKey="lyrics"
        label="Lyrics / Metadata"
        icon={<Sparkles className="w-3.5 h-3.5" />}
        variations={variations}
        selected={selected.lyrics}
        showDiff={showDiff}
        onSelect={(i) => selectSection("lyrics", i)}
        getText={(v) => v.lyrics}
        getPreview={(v) => v.lyrics.slice(0, 320) + (v.lyrics.length > 320 ? "…" : "")}
        charLimit={4999}
        charMin={4900}
        getCharCount={(v) => v.lyrics.length}
        collapsible
      />

      {/* Composite Panel */}
      <div className="border border-primary/25 bg-card">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-primary/10">
          <div className="flex items-center gap-2">
            <GitMerge className="w-3.5 h-3.5 text-primary/60" />
            <span className="font-mono text-[11px] text-primary/70 uppercase tracking-wider font-medium">
              Your Composite
            </span>
            {anyNonDefault && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary/60">
                Mixed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                copy(
                  [
                    `=== STYLE OF MUSIC ===\n${merged.styleOfMusic}`,
                    `=== TITLE ===\n${merged.title}`,
                    `=== LYRICS / METADATA ===\n${merged.lyrics}`,
                    `=== NEGATIVE PROMPT ===\n${merged.negativePrompt}`,
                  ].join("\n\n"),
                  "Composite template copied!"
                )
              }
              className="flex items-center gap-1.5 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider border border-primary/20 text-zinc-500 hover:border-primary/40 hover:text-zinc-300 transition-all"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
            <button
              type="button"
              onClick={() => onMerge(merged)}
              className="flex items-center gap-1.5 px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider border border-primary bg-primary text-black hover:bg-primary/90 transition-all"
            >
              <Check className="w-3 h-3" />
              Use This Template
            </button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <CompositePanelSection
            label="Style of Music"
            fromVariation={selected.styleOfMusic}
            value={merged.styleOfMusic}
            charCount={merged.styleOfMusic.length}
            charLimit={900}
          />
          <CompositePanelSection
            label="Title"
            fromVariation={selected.title}
            value={merged.title}
          />
          <CompositePanelSection
            label="Negative Prompt"
            fromVariation={selected.negativePrompt}
            value={merged.negativePrompt}
            charCount={merged.negativePrompt.length}
            charLimit={199}
            charMin={180}
            mono
          />
          <CompositePanelSection
            label="Lyrics"
            fromVariation={selected.lyrics}
            value={merged.lyrics.slice(0, 200) + "…"}
            charCount={merged.lyrics.length}
            charLimit={4999}
            charMin={4900}
          />
        </div>
      </div>
    </div>
  );
}
