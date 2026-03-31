import { Loader2, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

type TransformCategory = "era" | "genre" | "mood" | "energy";

interface TransformPreset {
  id: string;
  name: string;
  category: TransformCategory;
}

const TRANSFORM_PRESETS: TransformPreset[] = [
  { id: "era-1960s", name: "1960s", category: "era" },
  { id: "era-1970s", name: "1970s", category: "era" },
  { id: "era-1980s", name: "1980s", category: "era" },
  { id: "era-1990s", name: "1990s", category: "era" },
  { id: "era-2000s", name: "2000s", category: "era" },
  { id: "era-modern", name: "Modern", category: "era" },
  { id: "genre-lofi", name: "Lo-Fi", category: "genre" },
  { id: "genre-orchestral", name: "Orchestral", category: "genre" },
  { id: "genre-edm", name: "EDM", category: "genre" },
  { id: "genre-jazz", name: "Jazz", category: "genre" },
  { id: "genre-acoustic", name: "Acoustic", category: "genre" },
  { id: "genre-hiphop", name: "Hip-Hop", category: "genre" },
  { id: "genre-metal", name: "Metal", category: "genre" },
  { id: "mood-darker", name: "Darker", category: "mood" },
  { id: "mood-uplifting", name: "More Uplifting", category: "mood" },
  { id: "mood-aggressive", name: "More Aggressive", category: "mood" },
  { id: "mood-calmer", name: "Calmer", category: "mood" },
  { id: "energy-ramp", name: "Ramp Up", category: "energy" },
  { id: "energy-wind", name: "Wind Down", category: "energy" },
];

export { TRANSFORM_PRESETS };

const CATEGORY_META: Record<TransformCategory, { label: string; color: string }> = {
  era:    { label: "Era Shift",     color: "text-violet-400 border-violet-400/30 bg-violet-400/5 hover:border-violet-400/60 hover:text-violet-300" },
  genre:  { label: "Genre Pivot",   color: "text-cyan-400 border-cyan-400/30 bg-cyan-400/5 hover:border-cyan-400/60 hover:text-cyan-300" },
  mood:   { label: "Mood Shift",    color: "text-amber-400 border-amber-400/30 bg-amber-400/5 hover:border-amber-400/60 hover:text-amber-300" },
  energy: { label: "Energy",        color: "text-green-400 border-green-400/30 bg-green-400/5 hover:border-green-400/60 hover:text-green-300" },
};

const CATEGORY_ORDER: TransformCategory[] = ["era", "genre", "mood", "energy"];

interface RemixToolbarProps {
  onTransform: (transformId: string) => void;
  activeTransformId: string | null;
  disabled?: boolean;
  chainLength: number;
}

export function RemixToolbar({ onTransform, activeTransformId, disabled, chainLength }: RemixToolbarProps) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    meta: CATEGORY_META[cat],
    presets: TRANSFORM_PRESETS.filter((p) => p.category === cat),
  }));

  return (
    <div className="w-full max-w-5xl mx-auto mt-3">
      <div className="bg-card border border-primary/15 px-4 py-3">
        <div className="flex items-center gap-2 mb-2.5">
          <GitBranch className="w-3.5 h-3.5 text-primary/60" />
          <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest">
            Remix Chain
          </span>
          {chainLength > 1 && (
            <span className="font-mono text-[10px] text-primary/40">
              {chainLength - 1} step{chainLength !== 2 ? "s" : ""}
            </span>
          )}
          {chainLength >= 10 && (
            <span className="font-mono text-[10px] text-yellow-500/80">max chain reached</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {grouped.map(({ cat, meta, presets }) => (
            <div key={cat} className="flex items-start gap-2">
              <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider w-14 shrink-0 pt-1 leading-tight">
                {meta.label}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => {
                  const isLoading = activeTransformId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => onTransform(preset.id)}
                      disabled={disabled || !!activeTransformId || chainLength >= 10}
                      title={`Apply "${preset.name}" transformation`}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 font-mono text-[11px] border transition-all",
                        meta.color,
                        (disabled || !!activeTransformId || chainLength >= 10) && "opacity-40 cursor-not-allowed pointer-events-none",
                        isLoading && "opacity-100 border-primary/60 text-primary bg-primary/10"
                      )}
                    >
                      {isLoading && <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" />}
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
