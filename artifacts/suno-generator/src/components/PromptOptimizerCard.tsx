import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Wrench,
  Sparkles,
} from "lucide-react";
import { scoreTemplate, type PromptScore, type ScoringIssue } from "@/lib/promptScorer";
import { cn } from "@/lib/utils";
import type { SunoTemplate } from "@workspace/api-client-react";

interface PromptOptimizerCardProps {
  template: SunoTemplate;
  onApplyFix: (field: "styleOfMusic" | "negativePrompt", value: string) => void;
}

function CircularScore({ score }: { score: number }) {
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const progress = (score / 100) * circ;
  const color =
    score >= 85 ? "hsl(142 70% 48%)" :
    score >= 65 ? "hsl(188 100% 50%)" :
    score >= 45 ? "hsl(38 95% 58%)" :
    "hsl(0 72% 55%)";

  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
        <circle
          cx="36" cy="36" r={radius}
          fill="none"
          stroke="hsl(0 0% 10%)"
          strokeWidth="5"
        />
        <circle
          cx="36" cy="36" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={circ}
          strokeDashoffset={circ - progress}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xs font-bold leading-none" style={{ color }}>
          {score}
        </span>
        <span className="font-mono text-[8px] text-zinc-600 leading-none mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

function ScoreGrade({ score }: { score: number }) {
  if (score >= 90) return <span className="font-mono text-[11px] text-green-400 font-bold">EXCELLENT</span>;
  if (score >= 75) return <span className="font-mono text-[11px] text-cyan-400 font-bold">GOOD</span>;
  if (score >= 55) return <span className="font-mono text-[11px] text-yellow-400 font-bold">FAIR</span>;
  return <span className="font-mono text-[11px] text-red-400 font-bold">NEEDS WORK</span>;
}

function IssueRow({ issue }: { issue: ScoringIssue }) {
  const [expanded, setExpanded] = useState(false);

  const iconEl =
    issue.severity === "error" ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-px" /> :
    issue.severity === "warning" ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-px" /> :
    <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-px" />;

  return (
    <div className={cn(
      "border-b border-primary/8 last:border-0",
      issue.severity === "error" ? "bg-red-500/3" :
      issue.severity === "warning" ? "bg-yellow-500/3" :
      "bg-cyan-500/3"
    )}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/3 transition-colors"
      >
        {iconEl}
        <span className="font-mono text-[11px] text-zinc-300 leading-tight flex-1">{issue.title}</span>
        {expanded
          ? <ChevronUp className="w-3 h-3 text-zinc-600 shrink-0 mt-px" />
          : <ChevronDown className="w-3 h-3 text-zinc-600 shrink-0 mt-px" />
        }
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2.5 pl-8 space-y-1">
              <p className="font-mono text-[10px] text-zinc-500 leading-relaxed">{issue.detail}</p>
              {issue.fix && (
                <p className="font-mono text-[10px] text-cyan-500/80 leading-relaxed">
                  <span className="text-cyan-600">→ </span>{issue.fix}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CategoryBar({ label, score, maxScore, passed }: { label: string; score: number; maxScore: number; passed: boolean }) {
  const pct = (score / maxScore) * 100;
  const color = passed
    ? "bg-green-500/70"
    : pct >= 60 ? "bg-yellow-500/70" : "bg-red-500/60";

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 shrink-0 flex items-center gap-1">
        {passed
          ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
          : <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
        }
        <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-wide truncate">{label}</span>
      </div>
      <div className="flex-1 bg-zinc-900 h-1.5 rounded-sm overflow-hidden">
        <motion.div
          className={cn("h-full rounded-sm", color)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, delay: 0.1 }}
        />
      </div>
      <span className="font-mono text-[9px] text-zinc-600 w-10 text-right shrink-0">
        {score}/{maxScore}
      </span>
    </div>
  );
}

export function PromptOptimizerCard({ template, onApplyFix }: PromptOptimizerCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [fixApplied, setFixApplied] = useState(false);

  const score: PromptScore = useMemo(
    () => scoreTemplate(template),
    [template]
  );

  const hasAutoFixes = score.autoFixStyle !== null || score.autoFixNegative !== null;

  const handleFixAll = () => {
    if (score.autoFixStyle !== null) {
      onApplyFix("styleOfMusic", score.autoFixStyle);
    }
    if (score.autoFixNegative !== null) {
      onApplyFix("negativePrompt", score.autoFixNegative);
    }
    setFixApplied(true);
    setTimeout(() => setFixApplied(false), 3000);
  };

  const sortedIssues = [...score.issues].sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const errorCount = score.issues.filter((i) => i.severity === "error").length;
  const warningCount = score.issues.filter((i) => i.severity === "warning").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className="w-full max-w-5xl mx-auto bg-card border border-primary/15 overflow-hidden"
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-primary/3 transition-colors"
      >
        <Sparkles className="w-4 h-4 text-primary/60 shrink-0" />
        <div className="flex-1 flex items-center gap-3 flex-wrap min-w-0">
          <span className="font-mono text-[11px] text-primary/50 uppercase tracking-widest">
            Quality Score
          </span>
          <ScoreGrade score={score.overall} />
          {score.issues.length === 0 ? (
            <span className="font-mono text-[10px] text-green-500/70">All checks passed</span>
          ) : (
            <div className="flex items-center gap-2">
              {errorCount > 0 && (
                <span className="font-mono text-[10px] text-red-400/80">
                  {errorCount} error{errorCount > 1 ? "s" : ""}
                </span>
              )}
              {warningCount > 0 && (
                <span className="font-mono text-[10px] text-yellow-400/80">
                  {warningCount} warning{warningCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <CircularScore score={score.overall} />
          {expanded
            ? <ChevronUp className="w-4 h-4 text-zinc-600" />
            : <ChevronDown className="w-4 h-4 text-zinc-600" />
          }
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="border-t border-primary/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x divide-primary/10">
                <div className="p-4 space-y-2">
                  <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider mb-3">Category Breakdown</p>
                  {Object.values(score.categories).map((cat) => (
                    <CategoryBar
                      key={cat.label}
                      label={cat.label}
                      score={cat.score}
                      maxScore={cat.maxScore}
                      passed={cat.passed}
                    />
                  ))}
                </div>

                <div className="flex flex-col">
                  {sortedIssues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500/50" />
                      <p className="font-mono text-[11px] text-green-500/70">All checks passed</p>
                      <p className="font-mono text-[10px] text-zinc-600">This template meets Suno best practices.</p>
                    </div>
                  ) : (
                    <>
                      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider">
                          Issues & Suggestions
                        </p>
                        {hasAutoFixes && (
                          <button
                            onClick={handleFixAll}
                            className={cn(
                              "flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border transition-all",
                              fixApplied
                                ? "border-green-500/40 text-green-400 bg-green-500/8"
                                : "border-primary/30 text-primary hover:border-primary hover:bg-primary/8"
                            )}
                          >
                            {fixApplied ? (
                              <><CheckCircle2 className="w-3 h-3" /> Applied</>
                            ) : (
                              <><Wrench className="w-3 h-3" /> Fix All</>
                            )}
                          </button>
                        )}
                      </div>
                      <div className="overflow-y-auto max-h-60">
                        {sortedIssues.map((issue) => (
                          <IssueRow key={issue.id} issue={issue} />
                        ))}
                      </div>
                      {hasAutoFixes && (
                        <div className="px-4 py-2 border-t border-primary/8">
                          <p className="font-mono text-[10px] text-zinc-600">
                            <Zap className="w-2.5 h-2.5 inline mr-1 text-primary/40" />
                            Fix All applies auto-fixable issues (truncations) without re-generating.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
