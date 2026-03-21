import { motion } from "framer-motion";
import { Copy, Sparkles, Music, Mic2, Heading, Ban } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { SunoTemplate } from "@workspace/api-client-react/src/generated/api.schemas";
import { cn } from "@/lib/utils";

interface TemplateResultProps {
  template: SunoTemplate;
}

export function TemplateResult({ template }: TemplateResultProps) {
  const { copy } = useCopyToClipboard();

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
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

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="w-full max-w-5xl mx-auto flex flex-col gap-6 relative"
    >
      {/* Header Info */}
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
        <button
          onClick={copyAll}
          className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-95"
        >
          <Copy className="w-4 h-4" />
          Copy All to Suno
        </button>
      </motion.div>

      {/* Top row: Style + Title side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard
          variants={itemVariants}
          icon={<Music className="w-5 h-5 text-secondary" />}
          label="SECTION 1"
          title="Style of Music"
          content={template.styleOfMusic}
          onCopy={() => copy(template.styleOfMusic, "Style copied!")}
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
            mono={false}
          />
          <SectionCard
            variants={itemVariants}
            icon={<Ban className="w-5 h-5 text-destructive" />}
            label="SECTION 3"
            title="Negative Prompt"
            content={template.negativePrompt}
            onCopy={() => copy(template.negativePrompt, "Negative prompt copied!")}
            mono={true}
            accent="destructive"
          />
        </div>
      </div>

      {/* Lyrics / Metadata — full width */}
      <motion.div
        variants={itemVariants}
        className="bg-card/40 backdrop-blur-md border border-border p-6 rounded-2xl shadow-lg relative group flex flex-col"
      >
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-secondary" />
            <div>
              <span className="text-xs font-bold tracking-widest text-secondary uppercase opacity-70">
                SECTION 2
              </span>
              <h3 className="font-semibold text-foreground leading-tight">Lyrics / Metadata</h3>
            </div>
          </div>
          <CopyButton onClick={() => copy(template.lyrics, "Lyrics copied!")} isStatic />
        </div>

        <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          <pre className="font-mono text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">
            {template.lyrics.split(/(\[[^\]]*\]|\([^)]*\))/).map((part, i) => {
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
      </motion.div>
    </motion.div>
  );
}

function SectionCard({
  icon,
  label,
  title,
  content,
  onCopy,
  variants,
  mono,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  content: string;
  onCopy: () => void;
  variants: object;
  mono: boolean;
  accent?: "destructive";
}) {
  const accentColor = accent === "destructive" ? "text-destructive" : "text-secondary";

  return (
    <motion.div
      variants={variants}
      className="bg-card/40 backdrop-blur-md border border-border p-5 rounded-2xl shadow-lg relative group"
    >
      <div className="flex items-start gap-2 mb-3">
        {icon}
        <div>
          <span className={cn("text-xs font-bold tracking-widest uppercase opacity-70", accentColor)}>
            {label}
          </span>
          <h3 className="font-semibold text-foreground leading-tight">{title}</h3>
        </div>
      </div>
      <p
        className={cn(
          "text-zinc-200 leading-relaxed break-words",
          mono ? "font-mono text-sm" : "font-medium"
        )}
      >
        {content}
      </p>
      <CopyButton onClick={onCopy} />
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
          : "absolute top-4 right-4 opacity-0 group-hover:opacity-100 focus:opacity-100"
      )}
      aria-label="Copy"
    >
      <Copy className="w-4 h-4" />
    </button>
  );
}
