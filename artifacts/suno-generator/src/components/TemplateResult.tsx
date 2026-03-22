import { useState } from "react";
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
} from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { SunoTemplate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const ANTI_CLICHE_WORDS = [
  "pulsating", "ethereal tapestry", "sonic journey", "haunting melody",
  "sonic landscape", "musical tapestry", "immersive experience", "captivating",
  "mesmerizing", "transcendent", "otherworldly", "hypnotic", "ethereal",
  "lush tapestry", "sonic palette", "evocative", "ineffable", "sumptuous",
  "gossamer", "shimmering tapestry", "wistful reverie",
];

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

export function TemplateResult({
  template,
  regeneratingSection,
  onRegenerateSection,
  compact = false,
}: TemplateResultProps) {
  const { copy } = useCopyToClipboard();
  const [validatorExpanded, setValidatorExpanded] = useState(false);
  const [openSunoCopied, setOpenSunoCopied] = useState(false);

  const antiCliches = detectAntiCliches(template.styleOfMusic + " " + template.lyrics);

  const handleOpenSuno = () => {
    copy(template.styleOfMusic, "Style prompt copied! Paste it into Suno's Style field.");
    setOpenSunoCopied(true);
    setTimeout(() => setOpenSunoCopied(false), 3000);
    window.open("https://suno.com/create", "_blank");
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 300, damping: 24 },
    },
  };

  const copyAll = () => {
    const fullText = [
      `=== STYLE OF MUSIC ===\n${template.styleOfMusic}`,
      `=== TITLE ===\n${template.title}`,
      `=== LYRICS / METADATA ===\n${template.lyrics}`,
      template.negativePrompt ? `=== NEGATIVE PROMPT ===\n${template.negativePrompt}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    copy(fullText, "Full template copied to clipboard!");
  };

  const exportAsTxt = () => {
    const fullText = [
      `SUNO.AI TEMPLATE — ${template.songTitle}`,
      `Artist: ${template.artist}`,
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "=".repeat(60),
      "SECTION 1: STYLE OF MUSIC",
      "=".repeat(60),
      template.styleOfMusic,
      "",
      "=".repeat(60),
      "TITLE",
      "=".repeat(60),
      template.title,
      "",
      "=".repeat(60),
      "SECTION 2: LYRICS / METADATA",
      "=".repeat(60),
      template.lyrics,
      "",
      "=".repeat(60),
      "SECTION 3: NEGATIVE PROMPT",
      "=".repeat(60),
      template.negativePrompt,
    ].join("\n");

    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.songTitle.replace(/[^a-zA-Z0-9 ]/g, "").trim()} - Suno Template.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const styleCharLimit = 900;
  const styleOverLimit = template.styleOfMusic.length > styleCharLimit;
  const styleNearLimit = template.styleOfMusic.length > styleCharLimit * 0.85;

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
          </div>
          <h2 className="text-xl font-bold text-white leading-tight">
            {template.songTitle}
          </h2>
          <p className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px] text-zinc-500">
            <Mic2 className="w-3 h-3 text-primary/40" />
            {template.artist}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
            onClick={copyAll}
            className="flex items-center gap-1.5 px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider border border-primary bg-primary text-black hover:bg-primary/90 transition-all"
          >
            <Copy className="w-3 h-3" />
            Copy All
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
              <p className="font-mono text-[10px] text-yellow-600/70 pt-2">Generic words produce vague Suno output. Regenerate the Style section to fix.</p>
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
        <SectionCard
          variants={itemVariants}
          icon={<Music className="w-5 h-5 text-secondary" />}
          label="SECTION 1"
          title="Style of Music"
          content={template.styleOfMusic}
          charCount={template.styleOfMusic.length}
          charLimit={styleCharLimit}
          charWarning={styleNearLimit}
          charError={styleOverLimit}
          onCopy={() => copy(template.styleOfMusic, "Style copied!")}
          onRegenerate={() => onRegenerateSection("styleOfMusic")}
          isRegenerating={regeneratingSection === "styleOfMusic"}
          mono={false}
        />
        <div className="flex flex-col gap-4">
          <SectionCard
            variants={itemVariants}
            icon={<Heading className="w-5 h-5 text-accent" />}
            label="TITLE"
            title="Suno Title"
            content={template.title}
            onCopy={() => copy(template.title, "Title copied!")}
            onRegenerate={() => onRegenerateSection("title")}
            isRegenerating={regeneratingSection === "title"}
            mono={false}
          />
          <SectionCard
            variants={itemVariants}
            icon={<Ban className="w-5 h-5 text-destructive" />}
            label="SECTION 3"
            title="Negative Prompt"
            content={template.negativePrompt}
            charCount={template.negativePrompt.length}
            charLimit={200}
            charWarning={template.negativePrompt.length > 150}
            onCopy={() => copy(template.negativePrompt, "Negative prompt copied!")}
            onRegenerate={() => onRegenerateSection("negativePrompt")}
            isRegenerating={regeneratingSection === "negativePrompt"}
            mono={true}
            accent="destructive"
          />
        </div>
      </div>

      {/* Lyrics / Metadata — full width */}
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
              <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">Section 2</span>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white leading-tight">Lyrics / Metadata</h3>
                <CharBadge
                  count={template.lyrics.length}
                  limit={4999}
                  warning={template.lyrics.length < 4900}
                  error={template.lyrics.length > 4999}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <RegenerateButton
              onClick={() => onRegenerateSection("lyrics")}
              isRegenerating={regeneratingSection === "lyrics"}
            />
            <CopyButton onClick={() => copy(template.lyrics, "Lyrics copied!")} isStatic />
          </div>
        </div>

        {regeneratingSection === "lyrics" ? (
          <div className="flex items-center justify-center py-12 gap-2 text-zinc-600">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="font-mono text-[11px] text-primary/50">Regenerating...</span>
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            <pre className="font-mono text-sm leading-relaxed text-zinc-400 whitespace-pre-wrap">
              {template.lyrics.split(/(\[[^\]]*\]|\([^)]*\))/).map((part: string, i: number) => {
                if (part.startsWith("[") && part.endsWith("]")) {
                  return (
                    <span key={i} className="text-primary font-semibold">
                      {part}
                    </span>
                  );
                }
                if (part.startsWith("(") && part.endsWith(")")) {
                  return (
                    <span key={i} className="text-primary/60 italic">
                      {part}
                    </span>
                  );
                }
                return <span key={i}>{part}</span>;
              })}
            </pre>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function CharBadge({
  count,
  limit,
  warning,
  error,
}: {
  count: number;
  limit: number;
  warning?: boolean;
  error?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] px-1.5 py-0.5 border",
        error
          ? "border-destructive/40 text-destructive"
          : warning
            ? "border-yellow-500/30 text-yellow-500"
            : "border-primary/25 text-primary/60"
      )}
    >
      {count.toLocaleString()} / {limit.toLocaleString()}
    </span>
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

function SectionCard({
  icon: _icon,
  label,
  title,
  content,
  charCount,
  charLimit,
  charWarning,
  charError,
  onCopy,
  onRegenerate,
  isRegenerating,
  variants,
  mono,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  content: string;
  charCount?: number;
  charLimit?: number;
  charWarning?: boolean;
  charError?: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  variants: Variants;
  mono: boolean;
  accent?: "destructive";
}) {
  const borderColor = accent === "destructive" ? "border-destructive/20" : "border-primary/15";
  const labelColor = accent === "destructive" ? "text-destructive/50" : "text-primary/50";

  return (
    <motion.div
      variants={variants}
      className={cn(
        "bg-card border p-4 relative group flex flex-col gap-2.5",
        borderColor,
        isRegenerating && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className={cn("font-mono text-[10px] uppercase tracking-widest block", labelColor)}>
            {label}
          </span>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <h3 className="text-sm font-semibold text-white leading-tight">{title}</h3>
            {charCount !== undefined && charLimit !== undefined && (
              <CharBadge
                count={charCount}
                limit={charLimit}
                warning={charWarning}
                error={charError}
              />
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <RegenerateButton onClick={onRegenerate} isRegenerating={isRegenerating} />
          <CopyButton onClick={onCopy} />
        </div>
      </div>

      {isRegenerating ? (
        <div className="flex items-center gap-2 py-4 text-zinc-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          <span className="font-mono text-[11px] text-primary/50">Regenerating...</span>
        </div>
      ) : (
        <p
          className={cn(
            "text-zinc-300 leading-relaxed break-words text-sm",
            mono ? "font-mono" : ""
          )}
        >
          {content}
        </p>
      )}
    </motion.div>
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
        isStatic
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 focus:opacity-100"
      )}
      aria-label="Copy"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}
