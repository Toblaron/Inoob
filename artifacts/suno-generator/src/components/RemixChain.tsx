import { GitBranch, RotateCcw, ChevronRight } from "lucide-react";
import type { SunoTemplate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export interface RemixSnapshot {
  label: string;
  template: SunoTemplate;
}

interface RemixChainProps {
  chain: RemixSnapshot[];
  currentIndex: number;
  onRestore: (index: number) => void;
  onBranch: (index: number) => void;
}

export function RemixChain({ chain, currentIndex, onRestore, onBranch }: RemixChainProps) {
  if (chain.length <= 1) return null;

  return (
    <div className="w-full max-w-5xl mx-auto mt-2">
      <div className="bg-card border border-primary/10 px-4 py-2.5 overflow-x-auto">
        <div className="flex items-center gap-0 min-w-max">
          {chain.map((snap, i) => {
            const isCurrent = i === currentIndex;
            const isLast = i === chain.length - 1;

            return (
              <div key={i} className="flex items-center gap-0">
                <div
                  className={cn(
                    "group flex items-center gap-1.5 px-2.5 py-1.5 border transition-all relative",
                    isCurrent
                      ? "border-primary/40 bg-primary/8 text-primary"
                      : "border-primary/15 text-zinc-500 hover:border-primary/30 hover:text-zinc-300 cursor-pointer"
                  )}
                >
                  <button
                    onClick={() => !isCurrent && onRestore(i)}
                    disabled={isCurrent}
                    className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider disabled:cursor-default"
                    title={isCurrent ? "Current state" : `Restore: ${snap.label}`}
                  >
                    {i === 0 && <GitBranch className="w-2.5 h-2.5 opacity-60" />}
                    {snap.label}
                  </button>

                  {i < chain.length - 1 && (
                    <button
                      onClick={() => onBranch(i)}
                      title={
                        isCurrent
                          ? `Branch here — clears ${chain.length - 1 - i} forward step${chain.length - 1 - i !== 1 ? "s" : ""}`
                          : `Branch from "${snap.label}" — clears forward history`
                      }
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-yellow-500/60 hover:text-yellow-400"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>

                {!isLast && (
                  <ChevronRight className="w-3 h-3 text-zinc-700 mx-0.5 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
