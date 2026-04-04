import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "framer-motion";
import { Dna } from "lucide-react";
import type { SunoTemplate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface SongDnaProps {
  template: SunoTemplate;
  bpm?: number;
  musicalKey?: string;
  /** Detected/selected energy: "very chill" | "chill" | "medium" | "high" | "intense" */
  energy?: string;
  genres?: string[];
  moods?: string[];
  instruments?: string[];
  className?: string;
}

// Map energy labels to 0–100 scores
const ENERGY_SCORE: Record<string, number> = {
  "very chill": 10,
  "chill": 28,
  "medium": 50,
  "high": 74,
  "intense": 95,
};

function bpmToScore(bpm: number | undefined): number {
  if (!bpm) return 50;
  if (bpm < 60) return 15;
  if (bpm < 80) return 30;
  if (bpm < 100) return 45;
  if (bpm < 115) return 58;
  if (bpm < 130) return 70;
  if (bpm < 145) return 83;
  return 95;
}

/** Count bracketed production tags in lyrics */
function countProductionTags(lyrics: string): number {
  return (lyrics.match(/\[[^\]]{3,80}\]/g) ?? []).length;
}

/** Count distinct [Section header] types */
function countSections(lyrics: string): number {
  const sections = new Set(
    (lyrics.match(/\[(?:Verse|Chorus|Bridge|Pre-Chorus|Intro|Outro|Build|Drop|Hook|Instrumental|Spoken|Break)\b/gi) ?? [])
      .map((s) => s.toLowerCase())
  );
  return sections.size;
}

/** Estimate lyrical density: percentage of lyrics chars used vs max */
function lyricsUtilisation(lyrics: string): number {
  return Math.min(100, Math.round((lyrics.length / 4999) * 100));
}

/** Style prompt density: chars used vs max 900 */
function styleUtilisation(style: string): number {
  return Math.min(100, Math.round((style.length / 900) * 100));
}

/** Estimate production sophistication: count articulation vocabulary terms */
const ARTICULATION_TERMS = [
  "staccato", "legato", "pizzicato", "marcato", "palm-muted", "arpeggiated",
  "tremolo", "sustained", "gliding", "sidechain", "transient", "saturation",
  "reverb", "delay", "chorus", "phaser", "compressor", "limiter",
];
function productionScore(style: string, lyrics: string): number {
  const combined = (style + " " + lyrics).toLowerCase();
  const found = ARTICULATION_TERMS.filter((t) => combined.includes(t)).length;
  return Math.min(100, Math.round((found / ARTICULATION_TERMS.length) * 100) + 20);
}

/** Score moodiness: count of parenthetical performance directions */
function moodDepthScore(lyrics: string): number {
  const parens = (lyrics.match(/\([^)]{5,80}\)/g) ?? []).length;
  return Math.min(100, Math.round((parens / 20) * 100) + 10);
}

function buildDnaData(props: SongDnaProps) {
  const { template, bpm, energy = "medium", moods = [], instruments = [], genres = [] } = props;

  return [
    {
      axis: "Energy",
      value: ENERGY_SCORE[energy] ?? 50,
      description: `Energy: ${energy}`,
    },
    {
      axis: "Tempo",
      value: bpmToScore(bpm),
      description: bpm ? `${bpm} BPM` : "BPM unknown",
    },
    {
      axis: "Production",
      value: productionScore(template.styleOfMusic, template.lyrics),
      description: "Production depth (articulation vocabulary)",
    },
    {
      axis: "Style Density",
      value: styleUtilisation(template.styleOfMusic),
      description: `${template.styleOfMusic.length}/900 style chars`,
    },
    {
      axis: "Lyric Depth",
      value: lyricsUtilisation(template.lyrics),
      description: `${template.lyrics.length}/4999 lyric chars`,
    },
    {
      axis: "Structure",
      value: Math.min(100, countSections(template.lyrics) * 12),
      description: `${countSections(template.lyrics)} sections`,
    },
    {
      axis: "Mood",
      value: moodDepthScore(template.lyrics),
      description: `${moods.length > 0 ? moods.join(", ") : "performance directions"}`,
    },
    {
      axis: "Complexity",
      value: Math.min(100, (instruments.length * 12) + (genres.length * 8) + 20),
      description: `${instruments.length} instruments, ${genres.length} genres`,
    },
  ];
}

// Custom tooltip
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { axis: string; value: number; description: string } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-black/90 border border-primary/30 px-3 py-2 text-xs font-mono">
      <p className="text-primary font-bold">{d.axis}: {d.value}</p>
      <p className="text-zinc-400 mt-0.5">{d.description}</p>
    </div>
  );
}

export function SongDnaChart({ template, bpm, musicalKey, energy, genres, moods, instruments, className }: SongDnaProps) {
  const data = buildDnaData({ template, bpm, musicalKey, energy, genres, moods, instruments });

  const avgScore = Math.round(data.reduce((s, d) => s + d.value, 0) / data.length);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
      className={cn("bg-card border border-primary/20 p-4", className)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Dna className="w-4 h-4 text-primary/60" />
          <span className="font-mono text-[11px] text-primary/60 uppercase tracking-widest">Song DNA</span>
        </div>
        <div className="flex items-center gap-2">
          {musicalKey && (
            <span className="font-mono text-[10px] text-zinc-500 border border-zinc-800 px-1.5 py-0.5">
              {musicalKey}
            </span>
          )}
          {bpm && (
            <span className="font-mono text-[10px] text-zinc-500 border border-zinc-800 px-1.5 py-0.5">
              {bpm} BPM
            </span>
          )}
          <div className={cn(
            "font-mono text-[11px] font-bold px-2 py-0.5 border",
            avgScore >= 80 ? "border-green-500/40 text-green-400" :
            avgScore >= 60 ? "border-primary/40 text-primary" :
            "border-yellow-500/40 text-yellow-400"
          )}>
            {avgScore}%
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
          <PolarGrid
            gridType="polygon"
            stroke="rgba(255,255,255,0.06)"
          />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 9, fontFamily: "monospace" }}
          />
          <Radar
            name="DNA"
            dataKey="value"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={{ fill: "hsl(var(--primary))", r: 2.5 }}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-4 gap-1 mt-2">
        {data.map((d) => (
          <div key={d.axis} className="flex flex-col items-center gap-0.5">
            <div className="w-full h-0.5 bg-zinc-900 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary/60 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${d.value}%` }}
                transition={{ duration: 0.6, delay: 0.1 }}
              />
            </div>
            <span className="font-mono text-[8px] text-zinc-600">{d.axis}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
