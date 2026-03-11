import { motion } from "framer-motion";
import { Copy, Sparkles, Music, Tags, Mic2, Heading } from "lucide-react";
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
    const fullText = `Style of Music:\n${template.styleOfMusic}\n\nTitle:\n${template.title}\n\nLyrics:\n${template.lyrics}`;
    copy(fullText, "Full template copied to clipboard!");
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="w-full max-w-4xl mx-auto flex flex-col gap-6 relative"
    >
      {/* Header Info */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card/40 backdrop-blur-md border border-border p-6 rounded-2xl shadow-xl shadow-black/20">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            {template.songTitle}
          </h2>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <Mic2 className="w-4 h-4" /> Original Artist: <span className="text-foreground font-medium">{template.artist}</span>
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

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="md:col-span-4 flex flex-col gap-6">
          {/* Style of Music */}
          <SectionCard 
            variants={itemVariants}
            icon={<Music className="w-5 h-5 text-secondary" />}
            title="Style of Music"
            content={template.styleOfMusic}
            onCopy={() => copy(template.styleOfMusic, "Style copied!")}
            className="flex-1"
          />

          {/* Title */}
          <SectionCard 
            variants={itemVariants}
            icon={<Heading className="w-5 h-5 text-accent" />}
            title="Suno Title"
            content={template.title}
            onCopy={() => copy(template.title, "Title copied!")}
          />
          
          {/* Tags */}
          <motion.div variants={itemVariants} className="bg-card/40 backdrop-blur-md border border-border p-5 rounded-2xl shadow-lg relative group">
            <div className="flex items-center gap-2 mb-4 text-muted-foreground">
              <Tags className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Extracted Tags</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {template.tags.map((tag, i) => (
                <span key={i} className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-sm font-medium text-white/90">
                  {tag}
                </span>
              ))}
            </div>
            <CopyButton onClick={() => copy(template.tags.join(", "), "Tags copied!")} />
          </motion.div>
        </div>

        {/* Right Column (Lyrics) */}
        <div className="md:col-span-8 flex flex-col">
          <motion.div variants={itemVariants} className="bg-card/40 backdrop-blur-md border border-border p-6 rounded-2xl shadow-lg relative group flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="w-5 h-5 text-secondary" />
                <h3 className="font-semibold text-foreground">Structured Lyrics</h3>
              </div>
              <CopyButton onClick={() => copy(template.lyrics, "Lyrics copied!")} static />
            </div>
            
            <div className="flex-1 overflow-hidden relative">
              <div className="absolute inset-0 overflow-y-auto pr-4 custom-scrollbar">
                <pre className="font-mono text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">
                  {template.lyrics.split(/(\[.*?\])/).map((part, i) => {
                    if (part.startsWith('[') && part.endsWith(']')) {
                      return <span key={i} className="text-secondary font-bold">{part}</span>;
                    }
                    return <span key={i}>{part}</span>;
                  })}
                </pre>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function SectionCard({ 
  icon, 
  title, 
  content, 
  onCopy, 
  variants, 
  className 
}: { 
  icon: React.ReactNode, 
  title: string, 
  content: string, 
  onCopy: () => void, 
  variants: any,
  className?: string
}) {
  return (
    <motion.div variants={variants} className={cn("bg-card/40 backdrop-blur-md border border-border p-5 rounded-2xl shadow-lg relative group", className)}>
      <div className="flex items-center gap-2 mb-3 text-muted-foreground">
        {icon}
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <p className="text-zinc-200 font-medium leading-relaxed">{content}</p>
      <CopyButton onClick={onCopy} />
    </motion.div>
  );
}

function CopyButton({ onClick, static: isStatic = false }: { onClick: () => void, static?: boolean }) {
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
