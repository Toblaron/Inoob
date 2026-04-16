import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  GitMerge,
  Diff,
  Music,
  Sparkles,
  Ban,
  Copy,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
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

type VariationSlotValue = SunoTemplate | null | { error: string };

function isTemplate(v: VariationSlotValue): v is SunoTemplate {
  return v !== null && typeof v === "object" && "styleOfMusic" in v;
}
function isError(v: VariationSlotValue): v is { error: string } {
  return v !== null && typeof v === "object" && "error" in v;
}

interface VariationWorkshopProps {
  /** Fixed-length array (one per slot). null = loading, {error} = failed, SunoTemplate = ready. */
  variations: VariationSlotValue[];
  pending?: boolean[];
  totalCount?: number;
  onMerge: (merged: SunoTemplate) => void;
  onClose: () => void;
}

type DiffToken =
  | { kind: "equal"; text: string }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string };

function lcsWordDiff(base: string, changed: string): DiffToken[] {
  const bWords = base.split(/(\s+)/);
  const cWords = changed.split(/(\s+)/);
  const n = bWords.length;
  const m = cWords.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (bWords[i] === cWords[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && bWords[i] === cWords[j]) {
      tokens.push({ kind: "equal", text: bWords[i] });
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      tokens.push({ kind: "added", text: cWords[j] });
      j++;
    } else {
      tokens.push({ kind: "removed", text: bWords[i] });
      i++;
    }
  }
  return tokens;
}

function DiffText({ base, changed }: { base: string; changed: string }) {
  const tokens = lcsWordDiff(base, changed);
  return (
    <span className="whitespace-pre-wrap break-words">
      {tokens.map((t, i) => {
        if (t.kind === "equal") return <span key={i}>{t.text}</span>;
        if (t.kind === "added")
          return (
            <mark
              key={i}
              className="bg-emerald-500/20 text-emerald-300 not-italic rounded-sm"
            >
              {t.text}
            </mark>
          );
        return (
          <del
            key={i}
            className="bg-red-500/15 text-red-400 no-underline line-through rounded-sm opacity-70"
          >
            {t.text}
          </del>
        );
      })}
    </span>
  );
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

function CharBadge({
  count,
  limit,
  min,
}: {
  count: number;
  limit?: number;
  min?: number;
}) {
  const over = limit !== undefined && count > limit;
  const under = min !== undefined && count < min;
  return (
    <span
      className={cn(
        "font-mono text-[9px] px-1.5 py-0.5 border tabular-nums",
        over
          ? "border-destructive/40 text-destructive"
          : under
            ? "border-yellow-500/30 text-yellow-500"
            : "border-primary/20 text-primary/50"
      )}
    >
      {count.toLocaleString()}
      {limit ? `/${limit.toLocaleString()}` : ""}
    </span>
  );
}

interface ColumnProps {
  variationIdx: number;
  isReference: boolean;
  variation: SunoTemplate;
  reference: SunoTemplate;
  selected: Selection;
  showDiff: boolean;
  onSelect: (key: SectionKey) => void;
}

function VariationColumn({
  variationIdx,
  isReference,
  variation,
  reference,
  selected,
  showDiff,
  onSelect,
}: ColumnProps) {
  const label = `V${variationIdx + 1}`;
  const simStyle = isReference
    ? null
    : stringSimilarity(reference.styleOfMusic, variation.styleOfMusic);
  const simLyrics = isReference
    ? null
    : stringSimilarity(reference.lyrics, variation.lyrics);
  const simNeg = isReference
    ? null
    : stringSimilarity(reference.negativePrompt, variation.negativePrompt);

  const selectionBorder = (key: SectionKey) =>
    selected[key] === variationIdx
      ? "border-primary bg-primary/5"
      : "border-primary/10 hover:border-primary/35 bg-card cursor-pointer";

  return (
    <div className="flex flex-col gap-2 min-w-0">
      {/* Column header */}
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 border font-mono text-[11px] font-bold uppercase tracking-widest",
          isReference
            ? "border-zinc-700 text-zinc-400 bg-zinc-900"
            : "border-primary/30 text-primary bg-primary/5"
        )}
      >
        <span>{label}</span>
        {isReference && (
          <span className="font-mono text-[9px] text-zinc-600 normal-case tracking-normal font-normal">
            Reference
          </span>
        )}
      </div>

      {/* Style of Music */}
      <button
        type="button"
        onClick={() => onSelect("styleOfMusic")}
        className={cn(
          "relative w-full text-left p-3 border transition-all flex flex-col gap-1.5",
          selectionBorder("styleOfMusic")
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest flex items-center gap-1">
            <Music className="w-2.5 h-2.5" /> Style
          </span>
          <div className="flex items-center gap-1">
            {simStyle !== null && (
              <span
                className={cn(
                  "font-mono text-[9px] px-1 py-0.5",
                  simStyle >= 80
                    ? "text-zinc-600"
                    : simStyle >= 50
                      ? "text-amber-500"
                      : "text-primary/80"
                )}
              >
                {simStyle}%
              </span>
            )}
            <CharBadge count={variation.styleOfMusic.length} limit={900} />
          </div>
        </div>
        <p className="text-[11px] text-zinc-300 leading-relaxed break-words">
          {!isReference && showDiff ? (
            <DiffText base={reference.styleOfMusic} changed={variation.styleOfMusic} />
          ) : (
            variation.styleOfMusic
          )}
        </p>
        {selected.styleOfMusic === variationIdx && (
          <span className="absolute top-1 right-1 flex items-center gap-0.5 font-mono text-[8px] text-primary">
            <Check className="w-2.5 h-2.5" />
          </span>
        )}
      </button>

      {/* Title */}
      <button
        type="button"
        onClick={() => onSelect("title")}
        className={cn(
          "relative w-full text-left p-3 border transition-all flex flex-col gap-1.5",
          selectionBorder("title")
        )}
      >
        <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
          Title
        </span>
        <p className="text-[11px] text-zinc-300 font-medium leading-snug break-words">
          {!isReference && showDiff ? (
            <DiffText base={reference.title} changed={variation.title} />
          ) : (
            variation.title
          )}
        </p>
        {selected.title === variationIdx && (
          <span className="absolute top-1 right-1 flex items-center gap-0.5 font-mono text-[8px] text-primary">
            <Check className="w-2.5 h-2.5" />
          </span>
        )}
      </button>

      {/* Negative Prompt */}
      <button
        type="button"
        onClick={() => onSelect("negativePrompt")}
        className={cn(
          "relative w-full text-left p-3 border transition-all flex flex-col gap-1.5",
          selectionBorder("negativePrompt")
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest flex items-center gap-1">
            <Ban className="w-2.5 h-2.5" /> Negative
          </span>
          <div className="flex items-center gap-1">
            {simNeg !== null && (
              <span
                className={cn(
                  "font-mono text-[9px] px-1 py-0.5",
                  simNeg >= 80
                    ? "text-zinc-600"
                    : simNeg >= 50
                      ? "text-amber-500"
                      : "text-primary/80"
                )}
              >
                {simNeg}%
              </span>
            )}
            <CharBadge
              count={variation.negativePrompt.length}
              limit={199}
              min={180}
            />
          </div>
        </div>
        <p className="text-[11px] font-mono text-zinc-300 leading-relaxed break-words">
          {!isReference && showDiff ? (
            <DiffText base={reference.negativePrompt} changed={variation.negativePrompt} />
          ) : (
            variation.negativePrompt
          )}
        </p>
        {selected.negativePrompt === variationIdx && (
          <span className="absolute top-1 right-1 flex items-center gap-0.5 font-mono text-[8px] text-primary">
            <Check className="w-2.5 h-2.5" />
          </span>
        )}
      </button>

      {/* Lyrics */}
      <button
        type="button"
        onClick={() => onSelect("lyrics")}
        className={cn(
          "relative w-full text-left p-3 border transition-all flex flex-col gap-1.5 flex-1",
          selectionBorder("lyrics")
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" /> Lyrics
          </span>
          <div className="flex items-center gap-1">
            {simLyrics !== null && (
              <span
                className={cn(
                  "font-mono text-[9px] px-1 py-0.5",
                  simLyrics >= 80
                    ? "text-zinc-600"
                    : simLyrics >= 50
                      ? "text-amber-500"
                      : "text-primary/80"
                )}
              >
                {simLyrics}%
              </span>
            )}
            <CharBadge
              count={variation.lyrics.length}
              limit={4999}
              min={4900}
            />
          </div>
        </div>
        <p className="text-[11px] text-zinc-300 leading-relaxed break-words whitespace-pre-line">
          {!isReference && showDiff ? (
            <DiffText base={reference.lyrics} changed={variation.lyrics} />
          ) : (
            variation.lyrics
          )}
        </p>
        {selected.lyrics === variationIdx && (
          <span className="absolute top-1 right-1 flex items-center gap-0.5 font-mono text-[8px] text-primary">
            <Check className="w-2.5 h-2.5" />
          </span>
        )}
      </button>
    </div>
  );
}

interface CompositePanelReadyProps {
  merged: SunoTemplate;
  selected: Selection;
  resolvedSelected: Selection;
  firstReadyIdx: number;
  anyNonDefault: boolean;
  onCopy: () => void;
  onMerge: () => void;
}

type CompositeSectionSpec = {
  label: string;
  key: SectionKey;
  limit?: number;
  min?: number;
  mono?: boolean;
};

const COMPOSITE_SECTIONS: CompositeSectionSpec[] = [
  { label: "Style of Music", key: "styleOfMusic", limit: 900 },
  { label: "Title", key: "title" },
  { label: "Negative Prompt", key: "negativePrompt", limit: 199, min: 180, mono: true },
  { label: "Lyrics", key: "lyrics", limit: 4999, min: 4900 },
];

function CompositePanelReady({ merged, resolvedSelected, firstReadyIdx, anyNonDefault, onCopy, onMerge }: CompositePanelReadyProps) {
  return (
    <div className="border border-primary/25 bg-card">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-primary/10 flex-wrap gap-y-2">
        <div className="flex items-center gap-2">
          <GitMerge className="w-3.5 h-3.5 text-primary/60" />
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-wider font-medium">
            Your Composite
          </span>
          {anyNonDefault ? (
            <span className="font-mono text-[9px] px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary/60">
              Mixed
            </span>
          ) : (
            <span className="font-mono text-[9px] px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-600">
              All V{firstReadyIdx + 1}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider border border-primary/20 text-zinc-500 hover:border-primary/40 hover:text-zinc-300 transition-all"
          >
            <Copy className="w-3 h-3" />
            Copy All
          </button>
          <button
            type="button"
            onClick={onMerge}
            className="flex items-center gap-1.5 px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider border border-primary bg-primary text-black hover:bg-primary/90 transition-all"
          >
            <Check className="w-3 h-3" />
            Merge to Final
          </button>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {COMPOSITE_SECTIONS.map(({ label, key, limit, min, mono }) => {
          const val = (merged[key as keyof SunoTemplate] as string) ?? "";
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
                  {label}
                </span>
                <span className="font-mono text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary/70 border border-primary/20">
                  from V{resolvedSelected[key] + 1}
                </span>
                <CharBadge count={val.length} limit={limit} min={min} />
              </div>
              <p
                className={cn(
                  "text-[11px] text-zinc-300 leading-relaxed break-words",
                  mono ? "font-mono" : ""
                )}
              >
                {key === "lyrics" ? val.slice(0, 300) + (val.length > 300 ? "…" : "") : val}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ErrorColumn({ variationIdx, errorMsg }: { variationIdx: number; errorMsg?: string }) {
  return (
    <div className="flex flex-col gap-2 min-w-0 opacity-70">
      <div className="flex items-center justify-between px-3 py-2 border border-red-500/30 font-mono text-[11px] font-bold uppercase tracking-widest bg-red-500/5 text-red-400">
        <span>V{variationIdx + 1}</span>
        <span className="font-mono text-[9px] text-red-500/70 normal-case tracking-normal font-normal">Failed</span>
      </div>
      <div className="w-full p-6 border border-red-500/10 bg-card flex flex-col items-center justify-center gap-2 min-h-[120px]">
        <AlertCircle className="w-5 h-5 text-red-500/50" />
        <p className="font-mono text-[11px] text-red-400/60 text-center">
          {errorMsg ?? "Generation failed for this variation"}
        </p>
      </div>
    </div>
  );
}

function SkeletonColumn({ variationIdx }: { variationIdx: number }) {
  return (
    <div className="flex flex-col gap-2 min-w-0 opacity-60 animate-pulse">
      <div className="flex items-center justify-between px-3 py-2 border border-primary/30 font-mono text-[11px] font-bold uppercase tracking-widest bg-primary/5 text-primary">
        <span>V{variationIdx + 1}</span>
        <span className="font-mono text-[9px] text-zinc-600 normal-case tracking-normal font-normal">Generating…</span>
      </div>
      {[60, 20, 36, 180].map((h, i) => (
        <div
          key={i}
          className="w-full p-3 border border-primary/10 bg-card flex flex-col gap-2"
          style={{ minHeight: h }}
        >
          <div className="h-2 w-16 bg-zinc-800 rounded" />
          <div className="space-y-1.5">
            <div className="h-2 w-full bg-zinc-800 rounded" />
            <div className="h-2 w-4/5 bg-zinc-800 rounded" />
            <div className="h-2 w-3/5 bg-zinc-800 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function VariationWorkshop({
  variations,
  pending = [],
  totalCount,
  onMerge,
  onClose,
}: VariationWorkshopProps) {
  const { copy } = useCopyToClipboard();
  const [showDiff, setShowDiff] = useState(true);
  const [mobileTab, setMobileTab] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  const firstReadyIdx = variations.findIndex((v): v is SunoTemplate => isTemplate(v));
  const defaultIdx = firstReadyIdx >= 0 ? firstReadyIdx : 0;

  const [selected, setSelected] = useState<Selection>({
    styleOfMusic: defaultIdx,
    title: defaultIdx,
    lyrics: defaultIdx,
    negativePrompt: defaultIdx,
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectSection = (key: SectionKey, idx: number) => {
    setSelected((prev) => ({ ...prev, [key]: idx }));
  };

  const numTotal = totalCount || variations.length;
  const isStillLoading = pending.some(Boolean);

  const readySlots = variations.filter((v): v is SunoTemplate => isTemplate(v));
  const reference = readySlots[0] ?? null;

  const safeVariation = (idx: number): SunoTemplate | null => {
    const slot = variations[idx];
    if (isTemplate(slot)) return slot;
    return readySlots[0] ?? null;
  };

  const selIdx = (key: SectionKey) => {
    let idx = selected[key];
    while (idx > 0 && !isTemplate(variations[idx])) idx--;
    return idx;
  };

  const merged: SunoTemplate | null =
    reference !== null
      ? {
          ...reference,
          styleOfMusic: safeVariation(selIdx("styleOfMusic"))?.styleOfMusic ?? reference.styleOfMusic,
          title: safeVariation(selIdx("title"))?.title ?? reference.title,
          lyrics: safeVariation(selIdx("lyrics"))?.lyrics ?? reference.lyrics,
          negativePrompt: safeVariation(selIdx("negativePrompt"))?.negativePrompt ?? reference.negativePrompt,
        }
      : null;

  const resolvedSelected: Selection = {
    styleOfMusic: selIdx("styleOfMusic"),
    title: selIdx("title"),
    lyrics: selIdx("lyrics"),
    negativePrompt: selIdx("negativePrompt"),
  };

  const anyNonDefault = Object.values(resolvedSelected).some((v) => v !== firstReadyIdx);

  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -260, behavior: "smooth" });
  };
  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 260, behavior: "smooth" });
  };

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
              {reference?.songTitle ?? "Variation Workshop"}
            </h2>
            <span className="font-mono text-[10px] text-zinc-600">
              {isStillLoading
                ? `${readySlots.length}/${numTotal} ready`
                : `${readySlots.length} of ${numTotal} variations`}
            </span>
            {isStillLoading && (
              <span className="font-mono text-[9px] text-amber-400/80 animate-pulse">
                loading…
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDiff((v) => !v)}
            title="Toggle word-level diff highlighting"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
              showDiff
                ? "border-emerald-500/40 text-emerald-400 bg-emerald-400/5"
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

      {/* Diff legend */}
      {showDiff && variations.length > 1 && (
        <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-600 px-1">
          <span className="flex items-center gap-1">
            <span className="inline-block px-1 bg-emerald-500/20 text-emerald-300 rounded-sm">+added</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block px-1 bg-red-500/15 text-red-400 line-through rounded-sm opacity-70">-removed</span>
          </span>
          <span className="text-zinc-700">
            vs V{variations.findIndex((v): v is SunoTemplate => isTemplate(v)) + 1} (reference)
          </span>
        </div>
      )}

      {/* Click hint */}
      <p className="font-mono text-[10px] text-zinc-700 px-1">
        Click any section card to select that variation for your composite template.
      </p>

      {/* Mobile tabs */}
      <div className="flex sm:hidden border border-primary/20 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {Array.from({ length: numTotal }).map((_, i) => {
          const isReady = i < variations.length;
          const isPendingTab = pending[i] !== false && !isReady;
          return (
            <button
              key={i}
              type="button"
              onClick={() => isReady && setMobileTab(i)}
              disabled={!isReady}
              className={cn(
                "flex-1 min-w-[3.5rem] py-2 font-mono text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                mobileTab === i && isReady
                  ? "bg-primary/10 text-primary border-b-2 border-primary"
                  : isReady
                    ? "text-zinc-600 hover:text-zinc-400"
                    : "text-zinc-800 cursor-not-allowed"
              )}
            >
              V{i + 1}
              {i === 0 && isReady && (
                <span className="text-[8px] text-zinc-700 block font-normal normal-case tracking-normal leading-none">
                  ref
                </span>
              )}
              {isPendingTab && (
                <span className="text-[8px] text-zinc-700 block font-normal normal-case tracking-normal leading-none animate-pulse">
                  …
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Desktop: all columns side-by-side with scroll; Mobile: single tab */}
      <div className="relative">
        {/* Desktop scroll arrows */}
        {numTotal > 2 && (
          <>
            <button
              type="button"
              onClick={scrollLeft}
              className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 p-1 border border-primary/20 bg-background text-zinc-500 hover:text-zinc-300 transition-all"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={scrollRight}
              className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 p-1 border border-primary/20 bg-background text-zinc-500 hover:text-zinc-300 transition-all"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Desktop: all columns (real + skeleton placeholders) */}
        <div
          ref={scrollRef}
          className="hidden sm:grid gap-3 overflow-x-auto"
          style={{
            gridTemplateColumns: `repeat(${numTotal}, minmax(220px, 1fr))`,
            scrollbarWidth: "thin",
          }}
        >
          {Array.from({ length: numTotal }).map((_, i) => {
            const v = variations[i];
            if (isError(v)) return <ErrorColumn key={i} variationIdx={i} errorMsg={v.error} />;
            if (!isTemplate(v) || pending[i]) return <SkeletonColumn key={i} variationIdx={i} />;
            return (
              <VariationColumn
                key={i}
                variationIdx={i}
                isReference={i === firstReadyIdx}
                variation={v}
                reference={reference ?? v}
                selected={selected}
                showDiff={showDiff}
                onSelect={(key) => selectSection(key, i)}
              />
            );
          })}
        </div>

        {/* Mobile: single column for active tab — supports left/right swipe gestures */}
        <div
          className="sm:hidden"
          onTouchStart={(e) => { touchStartXRef.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartXRef.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartXRef.current;
            touchStartXRef.current = null;
            if (Math.abs(dx) < 40) return;
            if (dx < 0) setMobileTab((t) => Math.min(numTotal - 1, t + 1));
            else setMobileTab((t) => Math.max(0, t - 1));
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={mobileTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
            >
              {(() => {
                const v = variations[mobileTab];
                if (isError(v)) return <ErrorColumn variationIdx={mobileTab} errorMsg={v.error} />;
                if (!isTemplate(v) || pending[mobileTab]) return <SkeletonColumn variationIdx={mobileTab} />;
                return (
                  <VariationColumn
                    variationIdx={mobileTab}
                    isReference={mobileTab === firstReadyIdx}
                    variation={v}
                    reference={reference ?? v}
                    selected={selected}
                    showDiff={showDiff}
                    onSelect={(key) => selectSection(key, mobileTab)}
                  />
                );
              })()}
            </motion.div>
          </AnimatePresence>
          {/* Mobile prev/next */}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => setMobileTab((t) => Math.max(0, t - 1))}
              disabled={mobileTab === 0}
              className="flex items-center gap-1 px-3 py-1.5 font-mono text-[11px] border border-primary/20 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-3 h-3" /> Prev
            </button>
            <button
              type="button"
              onClick={() => setMobileTab((t) => Math.min(numTotal - 1, t + 1))}
              disabled={mobileTab === numTotal - 1}
              className="flex items-center gap-1 px-3 py-1.5 font-mono text-[11px] border border-primary/20 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-all"
            >
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Composite Panel — waiting state */}
      {variations.length === 0 && (
        <div className="border border-primary/10 bg-card px-5 py-6 text-center font-mono text-[11px] text-zinc-700 uppercase tracking-wider animate-pulse">
          Waiting for first variation…
        </div>
      )}

      {/* Composite Panel — only render once at least one variation is ready */}
      {readySlots.length > 0 && reference !== null && merged !== null && (
        <CompositePanelReady
          merged={merged}
          selected={selected}
          resolvedSelected={resolvedSelected}
          firstReadyIdx={firstReadyIdx}
          anyNonDefault={anyNonDefault}
          onCopy={() =>
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
          onMerge={() => onMerge(merged)}
        />
      )}
    </div>
  );
}
