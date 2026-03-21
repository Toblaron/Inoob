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
} from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { SunoTemplate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface TemplateResultProps {
  template: SunoTemplate;
  regeneratingSection: string | null;
  onRegenerateSection: (section: keyof SunoTemplate) => void;
}

export function TemplateResult({
  template,
  regeneratingSection,
  onRegenerateSection,
}: TemplateResultProps) {
  const { copy } = useCopyToClipboard();

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
      className="w-full max-w-5xl mx-auto flex flex-col gap-6 relative"
    >
      {/* Header info bar */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card/40 backdrop-blur-md border border-border p-6 rounded-2xl shadow-xl shadow-black/20"
      >
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            {template.songTitle}
          </h2>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <Mic2 className="w-4 h-4" /> Original Artist:{" "}
            <span className="text-foreground font-medium">{template.artist}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Open Suno */}
          <a
            href="https://suno.com/create"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            Open Suno
          </a>
          {/* Export */}
          <button
            onClick={exportAsTxt}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white transition-all"
          >
            <Download className="w-4 h-4" />
            Export .txt
          </button>
          {/* Copy all */}
          <button
            onClick={copyAll}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-95"
          >
            <Copy className="w-4 h-4" />
            Copy All
          </button>
        </div>
      </motion.div>

      {/* Top row: Style + Title/NegativePrompt */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        <div className="flex flex-col gap-6">
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
          "bg-card/40 backdrop-blur-md border border-border p-6 rounded-2xl shadow-lg relative group flex flex-col",
          regeneratingSection === "lyrics" && "opacity-60"
        )}
      >
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-secondary" />
            <div>
              <span className="text-xs font-bold tracking-widest text-secondary uppercase opacity-70">
                SECTION 2
              </span>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground leading-tight">Lyrics / Metadata</h3>
                <CharBadge
                  count={template.lyrics.length}
                  limit={4900}
                  warning={template.lyrics.length > 4400}
                  error={template.lyrics.length > 4900}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RegenerateButton
              onClick={() => onRegenerateSection("lyrics")}
              isRegenerating={regeneratingSection === "lyrics"}
            />
            <CopyButton onClick={() => copy(template.lyrics, "Lyrics copied!")} isStatic />
          </div>
        </div>

        {regeneratingSection === "lyrics" ? (
          <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Regenerating lyrics...</span>
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            <pre className="font-mono text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">
              {template.lyrics.split(/(\[[^\]]*\]|\([^)]*\))/).map((part: string, i: number) => {
                if (part.startsWith("[") && part.endsWith("]")) {
                  return (
                    <span key={i} className="text-secondary font-semibold">
                      {part}
                    </span>
                  );
                }
                if (part.startsWith("(") && part.endsWith(")")) {
                  return (
                    <span key={i} className="text-primary/80 italic">
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
        "text-xs font-mono px-2 py-0.5 rounded-full border",
        error
          ? "bg-destructive/20 text-destructive border-destructive/40"
          : warning
            ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
            : "bg-secondary/10 text-secondary border-secondary/30"
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
      className="p-2 rounded-lg bg-background/50 hover:bg-secondary/20 hover:text-secondary border border-white/5 hover:border-secondary/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      aria-label="Regenerate"
    >
      {isRegenerating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <RefreshCw className="w-4 h-4" />
      )}
    </button>
  );
}

function SectionCard({
  icon,
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
  const accentColor = accent === "destructive" ? "text-destructive" : "text-secondary";

  return (
    <motion.div
      variants={variants}
      className={cn(
        "bg-card/40 backdrop-blur-md border border-border p-5 rounded-2xl shadow-lg relative group flex flex-col gap-3",
        isRegenerating && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {icon}
          <div>
            <span className={cn("text-xs font-bold tracking-widest uppercase opacity-70", accentColor)}>
              {label}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground leading-tight">{title}</h3>
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
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <RegenerateButton onClick={onRegenerate} isRegenerating={isRegenerating} />
          <CopyButton onClick={onCopy} />
        </div>
      </div>

      {isRegenerating ? (
        <div className="flex items-center gap-2 py-4 text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Regenerating...</span>
        </div>
      ) : (
        <p
          className={cn(
            "text-zinc-200 leading-relaxed break-words",
            mono ? "font-mono text-sm" : "font-medium"
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
        "p-2 rounded-lg bg-background/50 hover:bg-primary hover:text-primary-foreground border border-white/5 hover:border-transparent transition-all",
        isStatic
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 focus:opacity-100"
      )}
      aria-label="Copy"
    >
      <Copy className="w-4 h-4" />
    </button>
  );
}
