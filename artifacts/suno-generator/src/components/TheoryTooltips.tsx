import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, Music2, Zap, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

interface TheoryTooltipsProps {
  bpm?: number | null;
  musicalKey?: string | null;
  energy?: string | null;
  tempo?: string | null;
  className?: string;
}

// Music theory knowledge base
const KEY_INFO: Record<string, { mood: string; relatives: string[]; commonGenres: string[]; description: string }> = {
  "C Major": { mood: "Bright, pure, innocent", relatives: ["A Minor"], commonGenres: ["Pop", "Classical", "Folk"], description: "The 'default' key — no sharps or flats. Often feels clean and direct." },
  "G Major": { mood: "Warm, uplifting, pastoral", relatives: ["E Minor"], commonGenres: ["Country", "Pop", "Rock"], description: "One sharp (F#). Feels natural on guitar, common in folk and country." },
  "D Major": { mood: "Triumphant, brilliant", relatives: ["B Minor"], commonGenres: ["Rock", "Classical", "Bluegrass"], description: "Two sharps. Bright and powerful — often used for anthemic moments." },
  "A Major": { mood: "Confident, bright, energetic", relatives: ["F# Minor"], commonGenres: ["Pop", "Rock", "Soul"], description: "Three sharps. Very common in pop and rock — feels celebratory." },
  "E Major": { mood: "Heroic, brilliant, piercing", relatives: ["C# Minor"], commonGenres: ["Rock", "Metal", "Blues"], description: "Four sharps. Electric guitar's natural home — raw and powerful." },
  "B Major": { mood: "Complex, intense, rich", relatives: ["G# Minor"], commonGenres: ["Jazz", "Classical", "R&B"], description: "Five sharps. Dense harmonic character, used in sophisticated compositions." },
  "F Major": { mood: "Pastoral, gentle, melancholic", relatives: ["D Minor"], commonGenres: ["Classical", "Jazz", "R&B"], description: "One flat. Warm and earthy — often used for introspective pieces." },
  "Bb Major": { mood: "Noble, majestic, bold", relatives: ["G Minor"], commonGenres: ["Jazz", "Hip-Hop", "Funk"], description: "Two flats. A horn player's key — very common in jazz and brass music." },
  "Eb Major": { mood: "Heroic, full, rich", relatives: ["C Minor"], commonGenres: ["Jazz", "Classical", "Gospel"], description: "Three flats. Lush and orchestral — popular in gospel and jazz standards." },
  "Ab Major": { mood: "Soft, dreamy, warm", relatives: ["F Minor"], commonGenres: ["R&B", "Soul", "Classical"], description: "Four flats. Velvety and smooth — beloved in R&B and soul ballads." },
  "A Minor": { mood: "Melancholic, dark, introspective", relatives: ["C Major"], commonGenres: ["Rock", "Metal", "Folk"], description: "Relative minor of C. The most 'natural' minor — often feels sorrowful or dramatic." },
  "E Minor": { mood: "Pensive, mysterious, serious", relatives: ["G Major"], commonGenres: ["Rock", "Metal", "Classical"], description: "One sharp. Very guitaristic — dark and introspective." },
  "D Minor": { mood: "Sad, mysterious, powerful", relatives: ["F Major"], commonGenres: ["Classical", "Electronic", "Doom Metal"], description: "One flat. Mozart called it the 'saddest key.' Rich and deeply emotional." },
  "B Minor": { mood: "Dark, isolated, sorrowful", relatives: ["D Major"], commonGenres: ["Rock", "Metal", "Classical"], description: "Two sharps. Solitary and brooding — often used for tragic themes." },
  "F# Minor": { mood: "Gloomy, anxious, passionate", relatives: ["A Major"], commonGenres: ["Metal", "Classical", "Electronic"], description: "Three sharps. Intense and turbulent — used for high-drama compositions." },
  "C Minor": { mood: "Dark, intense, heroic struggle", relatives: ["Eb Major"], commonGenres: ["Classical", "Hip-Hop", "Electronic"], description: "Three flats. Beethoven's key of fate and destiny — powerful and serious." },
  "G Minor": { mood: "Serious, anxious, complex", relatives: ["Bb Major"], commonGenres: ["Hip-Hop", "Jazz", "Electronic"], description: "Two flats. Used heavily in hip-hop and trap — has a distinctive urban feel." },
};

const BPM_ZONES = [
  { min: 0, max: 60, label: "Larghissimo / Grave", mood: "Extremely slow, solemn", genres: ["Ambient", "Drone", "Dark Orchestral"] },
  { min: 60, max: 72, label: "Largo / Adagio", mood: "Slow, dignified, expressive", genres: ["Ballads", "Blues", "Soul"] },
  { min: 72, max: 96, label: "Andante / Moderato", mood: "Walking pace, comfortable", genres: ["Pop", "R&B", "Acoustic"] },
  { min: 96, max: 120, label: "Allegretto / Allegro", mood: "Brisk, lively, upbeat", genres: ["Pop", "Dance", "Indie"] },
  { min: 120, max: 140, label: "Vivace", mood: "Energetic, vivacious", genres: ["House", "Dance Pop", "Punk"] },
  { min: 140, max: 160, label: "Presto", mood: "Fast, exciting, urgent", genres: ["Drum & Bass", "Hard Techno", "Metal"] },
  { min: 160, max: 999, label: "Prestissimo", mood: "Extremely fast, frantic", genres: ["Extreme Metal", "Hardcore", "Speedcore"] },
];

const CHORD_PROGRESSIONS: { name: string; numeral: string; description: string; examples: string[] }[] = [
  { name: "I–V–vi–IV", numeral: "Pop Progression", description: "The most common chord progression in Western pop. Used in thousands of hit songs.", examples: ["Someone Like You", "Let It Be", "No Woman No Cry"] },
  { name: "I–IV–V", numeral: "Blues/Rock Progression", description: "Foundation of blues and rock. Simple, powerful, and infinitely expressive.", examples: ["Johnny B. Goode", "La Bamba", "Twist and Shout"] },
  { name: "ii–V–I", numeral: "Jazz Turnaround", description: "The cornerstone of jazz harmony. Creates strong forward motion resolving to tonic.", examples: ["Autumn Leaves", "All The Things You Are", "Giant Steps"] },
  { name: "I–VI–IV–V", numeral: "Doo-Wop / 50s Progression", description: "The classic 50s sound. Nostalgic, warm, and circular.", examples: ["Earth Angel", "Stand By Me", "Every Breath You Take"] },
  { name: "vi–IV–I–V", numeral: "Minor-Start Pop", description: "Pop progression starting on relative minor. More introspective feel.", examples: ["Photograph", "Africa", "Demons"] },
  { name: "i–VII–VI–VII", numeral: "Andalusian Cadence", description: "Descending bass line with dramatic tension. Very cinematic.", examples: ["Hit The Road Jack", "White Rabbit", "Stairway to Heaven bridge"] },
];

function getBpmZone(bpm: number) {
  return BPM_ZONES.find((z) => bpm >= z.min && bpm < z.max) ?? BPM_ZONES[3];
}

function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="cursor-help"
      >
        {children}
      </span>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-zinc-950 border border-primary/30 p-3 shadow-xl pointer-events-none"
          >
            {content}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-primary/30" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

export function TheoryTooltips({ bpm, musicalKey, energy, tempo, className }: TheoryTooltipsProps) {
  const [showChords, setShowChords] = useState(false);

  const keyData = musicalKey ? KEY_INFO[musicalKey] ?? null : null;
  const bpmZone = bpm ? getBpmZone(bpm) : null;

  if (!bpm && !musicalKey && !energy) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-1.5">
        <Info className="w-3 h-3 text-primary/50" />
        <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest">Music Theory</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Key tooltip */}
        {musicalKey && (
          <Tooltip content={
            keyData ? (
              <div className="space-y-1.5">
                <p className="font-mono text-[11px] font-bold text-primary">{musicalKey}</p>
                <p className="font-mono text-[10px] text-zinc-300">{keyData.mood}</p>
                <p className="font-mono text-[9px] text-zinc-500 leading-relaxed">{keyData.description}</p>
                {keyData.relatives.length > 0 && (
                  <p className="font-mono text-[9px] text-zinc-500">Relative: <span className="text-zinc-400">{keyData.relatives.join(", ")}</span></p>
                )}
                <div className="flex flex-wrap gap-1 mt-1">
                  {keyData.commonGenres.map((g) => (
                    <span key={g} className="font-mono text-[8px] px-1 py-0.5 border border-primary/20 text-zinc-400">{g}</span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="font-mono text-[10px] text-zinc-400">Key: {musicalKey}</p>
            )
          }>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-primary/30 bg-primary/5 cursor-help hover:border-primary/60 transition-colors">
              <Music2 className="w-3 h-3 text-primary" />
              <span className="font-mono text-xs text-primary font-bold">{musicalKey}</span>
              <Info className="w-2.5 h-2.5 text-primary/40" />
            </div>
          </Tooltip>
        )}

        {/* BPM tooltip */}
        {bpm && bpmZone && (
          <Tooltip content={
            <div className="space-y-1.5">
              <p className="font-mono text-[11px] font-bold text-primary">{bpm} BPM</p>
              <p className="font-mono text-[10px] text-zinc-300">{bpmZone.label}</p>
              <p className="font-mono text-[9px] text-zinc-500">{bpmZone.mood}</p>
              <div className="mt-1">
                <p className="font-mono text-[8px] text-zinc-600 mb-1">Common genres at this tempo:</p>
                <div className="flex flex-wrap gap-1">
                  {bpmZone.genres.map((g) => (
                    <span key={g} className="font-mono text-[8px] px-1 py-0.5 border border-zinc-700 text-zinc-400">{g}</span>
                  ))}
                </div>
              </div>
            </div>
          }>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-zinc-700 cursor-help hover:border-zinc-500 transition-colors">
              <Hash className="w-3 h-3 text-zinc-400" />
              <span className="font-mono text-xs text-zinc-300 font-bold">{bpm} BPM</span>
              <span className="font-mono text-[9px] text-zinc-600">{bpmZone.label.split(" /")[0]}</span>
              <Info className="w-2.5 h-2.5 text-zinc-600" />
            </div>
          </Tooltip>
        )}

        {/* Energy tooltip */}
        {energy && (
          <Tooltip content={
            <div className="space-y-1.5">
              <p className="font-mono text-[11px] font-bold text-primary">Energy: {energy}</p>
              <p className="font-mono text-[9px] text-zinc-500 leading-relaxed">
                {energy === "low" && "Subdued, intimate, minimal instrumentation. Suited for introspective or ambient content."}
                {energy === "medium" && "Balanced energy — neither too intense nor too relaxed. Works across most contexts."}
                {energy === "high" && "Driven and intense. Dense production, strong rhythms, forward momentum."}
                {!["low","medium","high"].includes(energy) && `Energy descriptor affects production density, instrument prominence, and dynamic range.`}
              </p>
            </div>
          }>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-zinc-700 cursor-help hover:border-zinc-500 transition-colors">
              <Zap className="w-3 h-3 text-zinc-400" />
              <span className="font-mono text-xs text-zinc-300 capitalize">{energy}</span>
              <Info className="w-2.5 h-2.5 text-zinc-600" />
            </div>
          </Tooltip>
        )}
      </div>

      {/* Chord progressions reference */}
      <div>
        <button
          onClick={() => setShowChords((v) => !v)}
          className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors uppercase tracking-wider"
        >
          {showChords ? "▲" : "▼"} Common Chord Progressions
        </button>
        <AnimatePresence>
          {showChords && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-1.5">
                {CHORD_PROGRESSIONS.map((cp) => (
                  <Tooltip key={cp.name} content={
                    <div className="space-y-1.5">
                      <p className="font-mono text-[11px] font-bold text-primary">{cp.name}</p>
                      <p className="font-mono text-[9px] text-zinc-400 leading-relaxed">{cp.description}</p>
                      <div className="mt-1">
                        <p className="font-mono text-[8px] text-zinc-600 mb-1">Famous examples:</p>
                        {cp.examples.map((ex) => (
                          <p key={ex} className="font-mono text-[9px] text-zinc-500">• {ex}</p>
                        ))}
                      </div>
                    </div>
                  }>
                    <div className="flex items-center gap-2 px-2.5 py-1.5 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-help">
                      <span className="font-mono text-[10px] text-primary/70 w-20 shrink-0">{cp.name}</span>
                      <span className="font-mono text-[9px] text-zinc-500">{cp.numeral}</span>
                    </div>
                  </Tooltip>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
