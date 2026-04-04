import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shuffle,
  Check,
  Copy,
  ChevronDown,
  Loader2,
  Merge,
  Sparkles,
  X,
} from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { SunoTemplate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

type SectionKey = "styleOfMusic" | "title" | "lyrics" | "negativePrompt";

interface Variation {
  id: "A" | "B" | "C" | "D";
  label: string;
  template: SunoTemplate | null;
  loading: boolean;
  error?: string;
}

interface VariationWorkshopProps {
  /** The base template already generated */
  baseTemplate: SunoTemplate;
  /** Called when user wants to generate variations — receives variation indices 1-4 */
  onGenerateVariations: (indices: number[]) => void;
  /** Whether variations are being generated */
  isGenerating: boolean;
  /** The 4 variations (A=1, B=2, C=3, D=4) */
  variationA?: SunoTemplate | null;
  variationB?: SunoTemplate | null;
  variationC?: SunoTemplate | null;
  variationD?: SunoTemplate | null;
  /** Called when user selects a merged/chosen template */
  onSelectTemplate: (template: SunoTemplate) => void;
  onClose: () => void;
  className?: string;
}

const SECTION_LABELS: Record<SectionKey, string> = {
  styleOfMusic: "Style",
  title: "Title",
  lyrics: "Lyrics",
  negativePrompt: "Neg Prompt",
};

const SECTION_ICONS: Record<SectionKey, string> = {
  styleOfMusic: "🎨",
  title: "🏷️",
  lyrics: "📝",
  negativePrompt: "🚫",
};

const VARIATION_COLORS: Record<string, string> = {
  A: "border-blue-500/40 text-blue-400",
  B: "border-purple-500/40 text-purple-400",
  C: "border-orange-500/40 text-orange-400",
  D: "border-green-500/40 text-green-400",
};

export function VariationWorkshop({
  baseTemplate,
  onGenerateVariations,
  isGenerating,
  variationA,
  variationB,
  variationC,
  variationD,
  onSelectTemplate,
  onClose,
  className,
}: VariationWorkshopProps) {
  const { copy } = useCopyToClipboard();
  const [cherryPick, setCherryPick] = useState<Partial<Record<SectionKey, "base" | "A" | "B" | "C" | "D">>>({});
  const [expandedVariation, setExpandedVariation] = useState<string | null>(null);

  const variations: Variation[] = [
    { id: "A", label: "Variation A", template: variationA ?? null, loading: isGenerating && !variationA },
    { id: "B", label: "Variation B", template: variationB ?? null, loading: isGenerating && !variationB },
    { id: "C", label: "Variation C", template: variationC ?? null, loading: isGenerating && !variationC },
    { id: "D", label: "Variation D", template: variationD ?? null, loading: isGenerating && !variationD },
  ];

  const allDone = variations.every((v) => v.template !== null);

  const getVariantTemplate = (id: "base" | "A" | "B" | "C" | "D"): SunoTemplate | null => {
    if (id === "base") return baseTemplate;
    if (id === "A") return variationA ?? null;
    if (id === "B") return variationB ?? null;
    if (id === "C") return variationC ?? null;
    if (id === "D") return variationD ?? null;
    return null;
  };

  const buildMerged = (): SunoTemplate => {
    const SECTIONS: SectionKey[] = ["styleOfMusic", "title", "lyrics", "negativePrompt"];
    const result = { ...baseTemplate };
    for (const section of SECTIONS) {
      const picked = cherryPick[section] ?? "base";
      const source = getVariantTemplate(picked);
      if (source) (result as Record<string, unknown>)[section] = source[section];
    }
    return result;
  };

  const handleUseMerged = () => {
    onSelectTemplate(buildMerged());
    onClose();
  };

  const handleUseVariation = (id: "A" | "B" | "C" | "D") => {
    const t = getVariantTemplate(id);
    if (t) {
      onSelectTemplate(t);
      onClose();
    }
  };

  const truncate = (text: string, maxLen: number) =>
    text.length > maxLen ? text.slice(0, maxLen) + "…" : text;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className={cn("bg-card border border-primary/25 overflow-hidden", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-primary/10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary/60" />
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">Variation Workshop</span>
          <span className="font-mono text-[10px] text-zinc-600">Cherry-pick sections across variations</span>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Generate button */}
        {!variationA && !isGenerating && (
          <button
            onClick={() => onGenerateVariations([1, 2, 3, 4])}
            className="w-full flex items-center justify-center gap-2 py-3 border border-primary/30 text-primary font-mono text-xs uppercase tracking-wider hover:bg-primary/5 transition-all"
          >
            <Shuffle className="w-3.5 h-3.5" />
            Generate 4 Variations in Parallel
          </button>
        )}

        {isGenerating && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin text-primary/60" />
            <span className="font-mono text-xs text-zinc-500">Generating variations...</span>
          </div>
        )}

        {/* Variation cards */}
        {(variationA || variationB || variationC || variationD) && (
          <div className="grid grid-cols-2 gap-3">
            {variations.map((v) => (
              <div key={v.id} className={cn("border overflow-hidden", VARIATION_COLORS[v.id])}>
                <div
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/3 transition-colors"
                  onClick={() => setExpandedVariation(expandedVariation === v.id ? null : v.id)}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold">{v.label}</span>
                    {v.loading && <Loader2 className="w-3 h-3 animate-spin opacity-50" />}
                    {v.template && <Check className="w-3 h-3 text-green-400" />}
                  </div>
                  <div className="flex items-center gap-1">
                    {v.template && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUseVariation(v.id); }}
                        className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 border border-current hover:bg-current/10 transition-colors"
                      >
                        Use
                      </button>
                    )}
                    <ChevronDown className={cn("w-3 h-3 transition-transform", expandedVariation === v.id && "rotate-180")} />
                  </div>
                </div>

                <AnimatePresence>
                  {expandedVariation === v.id && v.template && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-current/20"
                    >
                      <div className="p-2.5 space-y-1.5">
                        <p className="font-mono text-[10px] text-zinc-400 leading-relaxed line-clamp-3">
                          {truncate(v.template.styleOfMusic, 200)}
                        </p>
                        <button
                          onClick={() => copy(v.template!.styleOfMusic, "Style copied!")}
                          className="flex items-center gap-1 font-mono text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                          <Copy className="w-2.5 h-2.5" /> Copy Style
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}

        {/* Cherry-pick section builder */}
        {allDone && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Merge className="w-3.5 h-3.5 text-primary/50" />
              <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">Cherry-Pick Sections</span>
            </div>

            {(["styleOfMusic", "title", "lyrics", "negativePrompt"] as SectionKey[]).map((section) => {
              const selected = cherryPick[section] ?? "base";
              const sources: Array<{ id: "base" | "A" | "B" | "C" | "D"; label: string }> = [
                { id: "base", label: "Base" },
                { id: "A", label: "A" },
                { id: "B", label: "B" },
                { id: "C", label: "C" },
                { id: "D", label: "D" },
              ];

              return (
                <div key={section} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 w-24 shrink-0">
                    <span className="text-xs">{SECTION_ICONS[section]}</span>
                    <span className="font-mono text-[10px] text-zinc-500 uppercase">{SECTION_LABELS[section]}</span>
                  </div>
                  <div className="flex gap-1">
                    {sources.map((src) => {
                      const srcTemplate = getVariantTemplate(src.id);
                      if (!srcTemplate) return null;
                      const isSelected = selected === src.id;
                      return (
                        <button
                          key={src.id}
                          onClick={() => setCherryPick((prev) => ({ ...prev, [section]: src.id }))}
                          title={truncate(String(srcTemplate[section]), 120)}
                          className={cn(
                            "font-mono text-[10px] w-10 py-1 border transition-all",
                            isSelected
                              ? "border-primary bg-primary text-black font-bold"
                              : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          {src.label}
                        </button>
                      );
                    })}
                  </div>
                  <span className="font-mono text-[9px] text-zinc-700 min-w-0 flex-1 truncate">
                    {truncate(String(getVariantTemplate(selected)?.[section] ?? ""), 60)}
                  </span>
                </div>
              );
            })}

            <button
              onClick={handleUseMerged}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-primary bg-primary text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all"
            >
              <Merge className="w-3.5 h-3.5" />
              Use Merged Template
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
