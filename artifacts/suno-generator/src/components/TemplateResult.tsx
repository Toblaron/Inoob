import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  Copy,
  Sparkles,
  Music,
  Mic2,
  Heading,
  Ban,
  RefreshCw,
  Download,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Pencil,
  FileJson,
} from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { SunoTemplate } from "@workspace/api-client-react";
import { ANTI_CLICHE_WORDS, detectConflicts } from "@/lib/promptScorer";
import { cn } from "@/lib/utils";

function detectAntiCliches(text: string): string[] {
  const lower = text.toLowerCase();
  return ANTI_CLICHE_WORDS.filter((w) => lower.includes(w.toLowerCase()));
}

interface TemplateResultProps {
  template: SunoTemplate;
  regeneratingSection: string | null;
  onRegenerateSection: (section: keyof SunoTemplate) => void;
  compact?: boolean;
}

/** Range-aware character counter badge. */
function RangeCharBadge({
  count,
  min,
  max,
}: {
  count: number;
  min?: number;
  max?: number;
}) {
  if (min === undefined || max === undefined) {
    return (
      <span className="font-mono text-[10px] px-1.5 py-0.5 border border-primary/25 text-primary/60">
        {count.toLocaleString()}
      </span>
    );
  }

  const inRange = count >= min && count <= max;
  const closeBelow = !inRange && count >= min - 30 && count < min;
  const closeAbove = !inRange && count > max && count <= max + 30;
  const close = closeBelow || closeAbove;

  return (
    <span
      className={cn(
        "font-mono text-[10px] px-1.5 py-0.5 border transition-colors",
        inRange
          ? "border-primary/40 text-primary bg-primary/5"
          : close
            ? "border-amber-500/40 text-amber-400 bg-amber-500/5"
            : "border-red-500/40 text-red-400 bg-red-500/5"
      )}
      title={`Target: ${min.toLocaleString()}–${max.toLocaleString()} chars`}
    >
      {count.toLocaleString()} / {max.toLocaleString()}
    </span>
  );
}

/** Auto-resizing textarea hook */
function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}

/** Single editable field — textarea with reset button and character counter. */
function EditableField({
  value,
  original,
  onChange,
  onReset,
  min,
  max,
  mono = false,
  maxHeight,
  placeholder,
  label,
}: {
  value: string;
  original: string;
  onChange: (v: string) => void;
  onReset: () => void;
  min?: number;
  max?: number;
  mono?: boolean;
  maxHeight?: number;
  placeholder?: string;
  label?: string;
}) {
  const ref = useAutoResize(value);
  const isDirty = value !== original;

  return (
    <div className="relative group/field">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        spellCheck={false}
        style={{ maxHeight: maxHeight ? `${maxHeight}px` : undefined, resize: "none" }}
        className={cn(
          "w-full bg-transparent text-zinc-300 text-sm leading-relaxed",
          "border border-transparent focus:border-primary/30 focus:outline-none",
          "rounded-none px-0 py-0 transition-colors",
          "hover:bg-white/[0.01]",
          mono ? "font-mono" : "",
          maxHeight ? "overflow-y-auto" : "overflow-hidden"
        )}
      />
      {isDirty && (
        <button
          onClick={onReset}
          title="Reset to AI output"
          className="absolute top-0 right-0 flex items-center gap-1 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-600 hover:text-amber-400 border border-transparent hover:border-amber-500/30 transition-all opacity-0 group-hover/field:opacity-100 focus:opacity-100"
        >
          <RotateCcw className="w-2.5 h-2.5" />
          Reset
        </button>
      )}
    </div>
  );
}

function RegenerateButton({
  onClick,
  isRegenerating,
}: {
  onClick: () => void;
  isRegenerating: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isRegenerating}
      title="Regenerate this section"
      className="p-1.5 border border-primary/15 text-zinc-600 hover:border-primary/40 hover:text-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label="Regenerate"
    >
      {isRegenerating ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
      ) : (
        <RefreshCw className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

function CopyButton({
  onClick,
  isStatic = false,
}: {
  onClick: () => void;
  isStatic?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-1.5 border border-primary/15 text-zinc-600 hover:border-primary/40 hover:text-primary transition-all",
        isStatic ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
      )}
      aria-label="Copy"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}

export function TemplateResult({
  template,
  regeneratingSection,
  onRegenerateSection,
  compact = false,
}: TemplateResultProps) {
  const { copy } = useCopyToClipboard();
  const [validatorExpanded, setValidatorExpanded] = useState(false);
  const [openSunoCopied, setOpenSunoCopied] = useState(false);
  const [copyMode, setCopyMode] = useState<"all" | "style" | "lyrics" | "bundle">("all");

  const [editedStyle, setEditedStyle] = useState(template.styleOfMusic ?? "");
  const [editedLyrics, setEditedLyrics] = useState(template.lyrics ?? "");
  const [editedNeg, setEditedNeg] = useState(template.negativePrompt ?? "");
  const [editedTitle, setEditedTitle] = useState(template.title ?? "");

  useEffect(() => {
    setEditedStyle(template.styleOfMusic ?? "");
    setEditedLyrics(template.lyrics ?? "");
    setEditedNeg(template.negativePrompt ?? "");
    setEditedTitle(template.title ?? "");
  }, [template]);

  const antiCliches = detectAntiCliches(editedStyle + " " + editedLyrics);
  const styleConflicts = detectConflicts(editedStyle);

  const handleOpenSuno = () => {
    copy(editedStyle, "Style prompt copied! Paste it into Suno's Style field.");
    setOpenSunoCopied(true);
    setTimeout(() => setOpenSunoCopied(false), 3000);
    window.open("https://suno.com/create", "_blank");
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  const copyAll = () => {
    const payload =
      copyMode === "style"
        ? editedStyle
        : copyMode === "lyrics"
          ? editedLyrics
          : copyMode === "bundle"
            ? JSON.stringify({
                songTitle: template.songTitle,
                artist: template.artist,
                title: editedTitle,
                styleOfMusic: editedStyle,
                lyrics: editedLyrics,
                negativePrompt: editedNeg,
              }, null, 2)
            : [
                `=== STYLE OF MUSIC ===\n${editedStyle}`,
                `=== TITLE ===\n${editedTitle}`,
                `=== LYRICS / METADATA ===\n${editedLyrics}`,
                editedNeg ? `=== NEGATIVE PROMPT ===\n${editedNeg}` : "",
              ]
                .filter(Boolean)
                .join("\n\n");
    copy(payload, copyMode === "bundle" ? "JSON bundle copied!" : "Template copied to clipboard!");
  };

  const exportAsTxt = () => {
    const fullText = [
      `SONIC ARCHITECT TEMPLATE — ${template.songTitle}`,
      `Artist: ${template.artist}`,
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "=".repeat(60),
      "THE RACK — Style of Music (target 900–999 chars)",
      "=".repeat(60),
      editedStyle,
      "",
      "=".repeat(60),
      "TITLE",
      "=".repeat(60),
      editedTitle,
      "",
      "=".repeat(60),
      "THE SCRIPT — Lyrics / Metadata (target 4900–4999 chars)",
      "=".repeat(60),
      editedLyrics,
      "",
      "=".repeat(60),
      "PROFESSIONAL EXCLUSIONS — Negative Prompt (target 150–199 chars)",
      "=".repeat(60),
      editedNeg,
    ].join("\n");

    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.artist} - ${template.songTitle} - SONIC ARCHITECT.txt`
      .replace(/[/\\?%*:|"<>]/g, "")
      .trim();
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsJson = () => {
    const blob = new Blob([JSON.stringify({
      songTitle: template.songTitle,
      artist: template.artist,
      title: editedTitle,
      styleOfMusic: editedStyle,
      lyrics: editedLyrics,
      negativePrompt: editedNeg,
      fingerprint: template.fingerprint ?? null,
      lyricsStructure: template.lyricsStructure ?? null,
      suggestedDefaults: template.suggestedDefaults ?? null,
    }, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.artist} - ${template.songTitle} - SONIC ARCHITECT.json`
      .replace(/[/\\?%*:|"<>]/g, "")
      .trim();
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="w-full max-w-5xl mx-auto flex flex-col gap-4 relative"
    >
      {/* Header info bar */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-card border border-primary/20 px-5 py-4"
      >
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest">Template Ready</span>
            {template.fromCache && (
              <span
                title="Metadata and AI output served from cache — no API calls made"
                className="flex items-center gap-0.5 font-mono text-[10px] uppercase tracking-wider text-cyan-400 border border-cyan-400/30 bg-cyan-400/5 px-1.5 py-0.5"
              >
                ⚡ Instant (cached)
              </span>
            )}
            <span
              title="Click any field below to edit it before copying"
              className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600 border border-zinc-700/40 bg-zinc-800/30 px-1.5 py-0.5"
            >
              <Pencil className="w-2.5 h-2.5" />
              Editable
            </span>
          </div>
          <h2 className="text-xl font-bold text-white leading-tight">{template.songTitle}</h2>
          <p className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px] text-zinc-500">
            <Mic2 className="w-3 h-3 text-primary/40" />
            {template.artist}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex border border-primary/20">
            {([
              ["all", "Full"],
              ["style", "Style"],
              ["lyrics", "Lyrics"],
              ["bundle", "JSON"],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setCopyMode(mode)}
                className={cn(
                  "px-2 py-1 font-mono text-[10px] uppercase tracking-wider border-r border-primary/10 last:border-r-0 transition-colors",
                  copyMode === mode ? "bg-primary/15 text-primary" : "text-zinc-600 hover:text-zinc-300"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleOpenSuno}
            title="Copies the Style Prompt to your clipboard, then opens Suno.ai"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
              openSunoCopied
                ? "border-primary/50 text-primary bg-primary/10"
                : "border-primary/25 text-zinc-400 hover:border-primary hover:text-primary"
            )}
          >
            {openSunoCopied ? <Check className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
            {openSunoCopied ? "Copied!" : "Open Suno"}
          </button>
          <button
            onClick={exportAsTxt}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-primary/25 text-zinc-400 hover:border-primary/50 hover:text-zinc-300 transition-all"
          >
            <Download className="w-3 h-3" />
            Export .txt
          </button>
          <button
            onClick={exportAsJson}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-primary/25 text-zinc-400 hover:border-primary/50 hover:text-zinc-300 transition-all"
          >
            <FileJson className="w-3 h-3" />
            Export .json
          </button>
          <button
            onClick={copyAll}
            className="flex items-center gap-1.5 px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider border border-primary bg-primary text-black hover:bg-primary/90 transition-all"
          >
            <Copy className="w-3 h-3" />
            Copy {copyMode === "all" ? "All" : copyMode === "bundle" ? "JSON" : copyMode === "style" ? "Style" : "Lyrics"}
          </button>
        </div>
      </motion.div>

      {/* Anti-cliché validator */}
      {antiCliches.length > 0 && !compact && (
        <motion.div variants={itemVariants} className="bg-yellow-500/5 border border-yellow-500/20 overflow-hidden">
          <button
            onClick={() => setValidatorExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-yellow-500/8 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
              <span className="font-mono text-[11px] text-yellow-400 uppercase tracking-wider">
                {antiCliches.length} cliché{antiCliches.length > 1 ? "s" : ""} detected — regen style for better results
              </span>
            </div>
            {validatorExpanded ? <ChevronUp className="w-3.5 h-3.5 text-yellow-600" /> : <ChevronDown className="w-3.5 h-3.5 text-yellow-600" />}
          </button>
          {validatorExpanded && (
            <div className="px-4 pb-3 space-y-2 border-t border-yellow-500/15">
              <p className="font-mono text-[10px] text-yellow-600/70 pt-2">Generic words produce vague Suno output. Edit or regenerate the Style section to fix.</p>
              <div className="flex flex-wrap gap-1">
                {antiCliches.map((w) => (
                  <span key={w} className="font-mono text-[10px] px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/25 text-yellow-400">
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Top row: Style + Title/NegativePrompt */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* THE RACK — Style of Music */}
        <motion.div
          variants={itemVariants}
          className={cn(
            "bg-card border border-primary/15 p-4 relative group flex flex-col gap-2.5",
            regeneratingSection === "styleOfMusic" && "opacity-50"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">Section 1 — THE RACK</span>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <div className="flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-secondary" />
                  <h3 className="text-sm font-semibold text-white leading-tight">Style of Music</h3>
                </div>
                <RangeCharBadge count={editedStyle.length} min={900} max={999} />
                {styleConflicts.length > 0 && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 border border-amber-500/30 text-amber-400 bg-amber-500/5">
                    {styleConflicts.length} conflict{styleConflicts.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <RegenerateButton onClick={() => onRegenerateSection("styleOfMusic")} isRegenerating={regeneratingSection === "styleOfMusic"} />
              <CopyButton onClick={() => copy(editedStyle, "Style copied!")} />
            </div>
          </div>

          {regeneratingSection === "styleOfMusic" ? (
            <div className="flex items-center gap-2 py-4 text-zinc-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span className="font-mono text-[11px] text-primary/50">Regenerating...</span>
            </div>
          ) : (
            <EditableField
              value={editedStyle}
              original={template.styleOfMusic ?? ""}
              onChange={setEditedStyle}
              onReset={() => setEditedStyle(template.styleOfMusic ?? "")}
              min={900}
              max={999}
              label="Style of Music"
              placeholder="Style of Music (THE RACK)"
            />
          )}
        </motion.div>

        {/* Right column: Title + Negative */}
        <div className="flex flex-col gap-4">
          {/* Title */}
          <motion.div
            variants={itemVariants}
            className={cn(
              "bg-card border border-primary/15 p-4 relative group flex flex-col gap-2.5",
              regeneratingSection === "title" && "opacity-50"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">Title</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Heading className="w-3.5 h-3.5 text-accent" />
                  <h3 className="text-sm font-semibold text-white leading-tight">Suno Title</h3>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <RegenerateButton onClick={() => onRegenerateSection("title")} isRegenerating={regeneratingSection === "title"} />
                <CopyButton onClick={() => copy(editedTitle, "Title copied!")} />
              </div>
            </div>
            {regeneratingSection === "title" ? (
              <div className="flex items-center gap-2 py-2 text-zinc-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="font-mono text-[11px] text-primary/50">Regenerating...</span>
              </div>
            ) : (
              <EditableField
                value={editedTitle}
                original={template.title ?? ""}
                onChange={setEditedTitle}
                onReset={() => setEditedTitle(template.title ?? "")}
                label="Suno Title"
                placeholder="Suno title"
              />
            )}
          </motion.div>

          {/* PROFESSIONAL EXCLUSIONS — Negative Prompt */}
          <motion.div
            variants={itemVariants}
            className={cn(
              "bg-card border border-destructive/20 p-4 relative group flex flex-col gap-2.5",
              regeneratingSection === "negativePrompt" && "opacity-50"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-[10px] text-destructive/50 uppercase tracking-widest block">Section 3 — Exclusions</span>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <div className="flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5 text-destructive" />
                    <h3 className="text-sm font-semibold text-white leading-tight">Negative Prompt</h3>
                  </div>
                  <RangeCharBadge count={editedNeg.length} min={150} max={199} />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <RegenerateButton onClick={() => onRegenerateSection("negativePrompt")} isRegenerating={regeneratingSection === "negativePrompt"} />
                <CopyButton onClick={() => copy(editedNeg, "Negative prompt copied!")} />
              </div>
            </div>
            {regeneratingSection === "negativePrompt" ? (
              <div className="flex items-center gap-2 py-4 text-zinc-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="font-mono text-[11px] text-primary/50">Regenerating...</span>
              </div>
            ) : (
              <EditableField
                value={editedNeg}
                original={template.negativePrompt ?? ""}
                onChange={setEditedNeg}
                onReset={() => setEditedNeg(template.negativePrompt ?? "")}
                min={150}
                max={199}
                mono
                label="Negative Prompt"
                placeholder="Professional exclusions"
              />
            )}
          </motion.div>
        </div>
      </div>

      {/* THE SCRIPT — Lyrics / Metadata — full width */}
      <motion.div
        variants={itemVariants}
        className={cn(
          "bg-card border border-primary/15 p-5 relative group flex flex-col",
          regeneratingSection === "lyrics" && "opacity-50"
        )}
      >
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-primary/10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary/60" />
            <div>
              <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">Section 2 — THE SCRIPT</span>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white leading-tight">Lyrics / Metadata</h3>
                <RangeCharBadge count={editedLyrics.length} min={4900} max={4999} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <RegenerateButton onClick={() => onRegenerateSection("lyrics")} isRegenerating={regeneratingSection === "lyrics"} />
            <CopyButton onClick={() => copy(editedLyrics, "Lyrics copied!")} isStatic />
          </div>
        </div>

        {regeneratingSection === "lyrics" ? (
          <div className="flex items-center justify-center py-12 gap-2 text-zinc-600">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="font-mono text-[11px] text-primary/50">Regenerating...</span>
          </div>
        ) : (
          <EditableField
            value={editedLyrics}
            original={template.lyrics ?? ""}
            onChange={setEditedLyrics}
            onReset={() => setEditedLyrics(template.lyrics ?? "")}
            min={4900}
            max={4999}
            mono
            maxHeight={600}
            label="Lyrics / Metadata"
            placeholder="Lyrics and production metadata (THE SCRIPT)"
          />
        )}
      </motion.div>
    </motion.div>
  );
}
