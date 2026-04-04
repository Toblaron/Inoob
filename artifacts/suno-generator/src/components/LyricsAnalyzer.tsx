import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, FileText, Hash, Mic2, Music2, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface LyricsAnalyzerProps {
  lyrics: string;
  className?: string;
}

interface SectionInfo {
  name: string;
  type: string;
  charCount: number;
  lineCount: number;
  hasPerformanceDir: boolean;
  hasInstrumentCues: boolean;
  hasAdLibs: boolean;
}

const SECTION_TYPES: Record<string, string> = {
  verse: "verse",
  chorus: "chorus",
  bridge: "bridge",
  "pre-chorus": "pre-chorus",
  prechorus: "pre-chorus",
  intro: "intro",
  outro: "outro",
  hook: "hook",
  build: "build",
  "build-up": "build",
  drop: "drop",
  breakdown: "breakdown",
  break: "break",
  interlude: "interlude",
  instrumental: "instrumental",
  solo: "solo",
  "spoken word": "spoken",
  narration: "spoken",
  "post-chorus": "post-chorus",
  "pre-intro": "pre-intro",
};

const SECTION_COLORS: Record<string, string> = {
  verse: "text-blue-400 border-blue-500/30 bg-blue-500/5",
  chorus: "text-primary border-primary/30 bg-primary/5",
  bridge: "text-purple-400 border-purple-500/30 bg-purple-500/5",
  "pre-chorus": "text-cyan-400 border-cyan-500/30 bg-cyan-500/5",
  intro: "text-zinc-400 border-zinc-500/30 bg-zinc-500/5",
  outro: "text-zinc-400 border-zinc-500/30 bg-zinc-500/5",
  hook: "text-yellow-400 border-yellow-500/30 bg-yellow-500/5",
  build: "text-orange-400 border-orange-500/30 bg-orange-500/5",
  drop: "text-red-400 border-red-500/30 bg-red-500/5",
  instrumental: "text-green-400 border-green-500/30 bg-green-500/5",
  solo: "text-green-400 border-green-500/30 bg-green-500/5",
  default: "text-zinc-400 border-zinc-600/30 bg-zinc-600/5",
};

function analyzeLyrics(lyrics: string) {
  const lines = lyrics.split("\n");

  // ── Extract sections ──────────────────────────────────────────────────────
  const sections: SectionInfo[] = [];
  let currentSection: SectionInfo | null = null;
  let currentContent: string[] = [];

  const closeSection = () => {
    if (!currentSection) return;
    const content = currentContent.join("\n");
    currentSection.charCount = content.length;
    currentSection.lineCount = currentContent.filter((l) => l.trim()).length;
    currentSection.hasPerformanceDir = /\([^)]{5,}\)/.test(content);
    currentSection.hasInstrumentCues = /\[(?!(?:Verse|Chorus|Bridge|Pre|Outro|Intro|Hook|Build|Drop|Breakdown|Break|Interlude|Instrumental|Solo|Spoken|Narration|Post|Final|Fade|End|Silence)[^[\]]*\])[^\]]{3,80}\]/.test(content);
    currentSection.hasAdLibs = /\((?:yeah|oh|uh|ah|hey|woah|let's|come on|ooh|mm)/i.test(content);
    sections.push(currentSection);
    currentSection = null;
    currentContent = [];
  };

  for (const line of lines) {
    const headerMatch = line.match(/^\[([^\]]+)\]/);
    if (headerMatch) {
      const headerText = headerMatch[1].toLowerCase();
      const typeKey = Object.keys(SECTION_TYPES).find((k) => headerText.includes(k));
      const type = typeKey ? SECTION_TYPES[typeKey] : "other";

      // Check if it's a production tag (not a section header)
      const isProductionTag = /^(?:produced|vocal:|mix:|rhythm:|chord|key:|bpm:|synthesis:|modulation:|spatial:|dynamics:|master:|tempo:|scale:)/i.test(headerMatch[1]);
      if (!isProductionTag) {
        closeSection();
        currentSection = { name: headerMatch[1], type, charCount: 0, lineCount: 0, hasPerformanceDir: false, hasInstrumentCues: false, hasAdLibs: false };
      }
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  closeSection();

  // ── Global stats ──────────────────────────────────────────────────────────
  const totalChars = lyrics.length;
  const totalLines = lines.filter((l) => l.trim()).length;

  const allBrackets = lyrics.match(/\[[^\]]{3,80}\]/g) ?? [];
  const productionTags = allBrackets.filter((b) => {
    const lower = b.toLowerCase();
    return /^\[(?:produced|vocal:|mix:|rhythm:|chord|key:|bpm:|synthesis:|modulation:|spatial:|dynamics:|master:)/i.test(b)
      || lower.includes("staccato") || lower.includes("legato") || lower.includes("pizzicato")
      || lower.includes("reverb") || lower.includes("delay") || lower.includes("compression");
  });

  const performanceDirs = lyrics.match(/\([^)]{5,80}\)/g) ?? [];
  const adLibs = performanceDirs.filter((p) => /\((?:yeah|oh|uh|ah|hey|woah|let's|come on|ooh|mm|whoa)/i.test(p));
  const vowelElongs = lyrics.match(/\w+-[a-z]{1,3}-[a-z]{1,3}\b/g) ?? [];
  const emojiCues = lyrics.match(/[🔥☕🔊🎶]/g) ?? [];

  // ── Rhyme scheme detection (last word of lyric lines) ─────────────────────
  const lyricLines = lines.filter((l) => l.trim() && !l.trim().startsWith("[") && !l.trim().startsWith("("));
  const lastWords = lyricLines.map((l) => {
    const words = l.trim().replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/);
    return words[words.length - 1]?.toLowerCase() ?? "";
  }).filter(Boolean);

  // Simple end-rhyme detector: check if pairs of last syllables match
  const rhymeGroups: Record<string, number[]> = {};
  lastWords.forEach((word, i) => {
    const key = word.slice(-3);
    if (!rhymeGroups[key]) rhymeGroups[key] = [];
    rhymeGroups[key].push(i);
  });
  const rhymePairs = Object.values(rhymeGroups).filter((g) => g.length >= 2).length;
  const rhymeScore = Math.min(100, Math.round((rhymePairs / Math.max(1, lyricLines.length / 2)) * 100));

  // ── Section type distribution ─────────────────────────────────────────────
  const typeCounts: Record<string, number> = {};
  for (const s of sections) {
    typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1;
  }

  return {
    sections,
    totalChars,
    totalLines,
    sectionCount: sections.length,
    productionTagCount: productionTags.length,
    performanceDirCount: performanceDirs.length,
    adLibCount: adLibs.length,
    vowelElongCount: vowelElongs.length,
    emojiCueCount: emojiCues.length,
    rhymeScore,
    typeCounts,
    charUtilisation: Math.min(100, Math.round((totalChars / 4999) * 100)),
  };
}

export function LyricsAnalyzer({ lyrics, className }: LyricsAnalyzerProps) {
  const [expanded, setExpanded] = useState(false);
  const analysis = useMemo(() => analyzeLyrics(lyrics), [lyrics]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("bg-card border border-primary/20", className)}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-primary/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-primary/50" />
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">Lyrics Analysis</span>
          <span className="font-mono text-[10px] text-zinc-600">
            {analysis.sectionCount} sections · {analysis.totalChars.toLocaleString()} chars
          </span>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-primary/10 pt-3 space-y-4">

              {/* Global stats row */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Char Fill", value: `${analysis.charUtilisation}%`, icon: <Hash className="w-3 h-3" />, good: analysis.charUtilisation >= 90 },
                  { label: "Prod Tags", value: analysis.productionTagCount, icon: <Tag className="w-3 h-3" />, good: analysis.productionTagCount >= 10 },
                  { label: "Perf Dirs", value: analysis.performanceDirCount, icon: <Mic2 className="w-3 h-3" />, good: analysis.performanceDirCount >= 8 },
                  { label: "Rhyme", value: `${analysis.rhymeScore}%`, icon: <Music2 className="w-3 h-3" />, good: analysis.rhymeScore >= 60 },
                ].map((stat) => (
                  <div key={stat.label} className={cn(
                    "flex flex-col items-center gap-1 p-2 border text-center",
                    stat.good ? "border-green-500/20 bg-green-500/3" : "border-zinc-700/30"
                  )}>
                    <span className={cn("text-[10px]", stat.good ? "text-green-400" : "text-zinc-500")}>{stat.icon}</span>
                    <span className={cn("font-mono text-sm font-bold", stat.good ? "text-green-400" : "text-zinc-400")}>{stat.value}</span>
                    <span className="font-mono text-[9px] text-zinc-600 uppercase">{stat.label}</span>
                  </div>
                ))}
              </div>

              {/* Ad-libs + vowel elongation */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Ad-libs", value: analysis.adLibCount, good: analysis.adLibCount >= 3, tip: analysis.adLibCount < 3 ? "Add (yeah!), (oh-oh) to choruses" : undefined },
                  { label: "Vowel Elong", value: analysis.vowelElongCount, good: analysis.vowelElongCount >= 2, tip: analysis.vowelElongCount < 2 ? "Add go-o-one, sta-a-ay" : undefined },
                  { label: "Emoji Cues", value: analysis.emojiCueCount, good: analysis.emojiCueCount >= 1, tip: undefined },
                ].map((stat) => (
                  <div key={stat.label} className={cn(
                    "px-2.5 py-1.5 border font-mono text-center",
                    stat.good ? "border-primary/20 text-primary" : "border-zinc-800 text-zinc-500"
                  )}>
                    <div className="text-base font-bold">{stat.value}</div>
                    <div className="text-[9px] uppercase tracking-wider">{stat.label}</div>
                    {stat.tip && <div className="text-[8px] text-yellow-500/70 mt-0.5">{stat.tip}</div>}
                  </div>
                ))}
              </div>

              {/* Section breakdown */}
              <div className="space-y-1">
                <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Section Breakdown</p>
                {analysis.sections.map((section, i) => {
                  const colorClass = SECTION_COLORS[section.type] ?? SECTION_COLORS.default;
                  return (
                    <div key={i} className={cn("flex items-center gap-2 px-2.5 py-1.5 border text-[10px] font-mono", colorClass)}>
                      <span className="font-bold min-w-[90px] truncate">{section.name}</span>
                      <span className="text-zinc-600 shrink-0">{section.charCount} chars</span>
                      <div className="flex items-center gap-1.5 ml-auto shrink-0">
                        {section.hasPerformanceDir && (
                          <span className="text-[8px] px-1 border border-current opacity-60">perf dir</span>
                        )}
                        {section.hasAdLibs && (
                          <span className="text-[8px] px-1 border border-current opacity-60">ad-libs</span>
                        )}
                        {section.hasInstrumentCues && (
                          <span className="text-[8px] px-1 border border-current opacity-60">inst cues</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Section type distribution */}
              {Object.keys(analysis.typeCounts).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(analysis.typeCounts).map(([type, count]) => (
                    <span key={type} className={cn(
                      "font-mono text-[9px] px-2 py-0.5 border",
                      SECTION_COLORS[type] ?? SECTION_COLORS.default
                    )}>
                      {type} ×{count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
