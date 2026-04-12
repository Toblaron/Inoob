import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ChevronDown, ChevronUp, Music2, Gauge, Piano, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

interface TheoryInfo {
  key?: string | null;
  bpm?: number | null;
  chordProgression?: string | null;
  timeSignature?: string | null;
}

interface TheoryTooltipsProps {
  info: TheoryInfo;
  className?: string;
}

const KEY_EXPLANATIONS: Record<string, string> = {
  "C major": "The most common key in Western music — bright, open, and universally familiar. C major has no sharps or flats, making it feel clean and accessible.",
  "G major": "Warm and uplifting with one sharp (F#). Often used in folk, country, and pop for its grounded, resonant quality.",
  "D major": "Bright and triumphant with two sharps. A favourite for anthems and rock because open D strings on guitar add natural resonance.",
  "A major": "Lively and energetic with three sharps. Feels confident and direct — common in pop and country.",
  "E major": "Rich and full with four sharps. The 'power chord' key — electric guitars naturally resonate here, making it ideal for rock.",
  "F major": "Warm and slightly melancholy with one flat. Often used in jazz and classical for its rounded, gentle character.",
  "B♭ major": "Smooth and warm with two flats. A favourite in jazz and brass music — the natural key for many wind instruments.",
  "E♭ major": "Noble and ceremonial with three flats. Common in jazz standards and classical pieces for its dignified feel.",
  "A minor": "The most natural minor key — melancholic, introspective, and emotionally resonant. No sharps or flats.",
  "E minor": "Dark and brooding with one sharp. Hugely popular in rock and metal — open Em chord rings powerfully on guitar.",
  "D minor": "Deep melancholy and drama. Once called 'the saddest of all keys' — used extensively in classical and cinematic music.",
  "B minor": "Passionate and intense with two sharps. A favourite for emotionally charged ballads and progressive rock.",
  "F# minor": "Mysterious and introspective. Common in K-pop and cinematic scores for its ethereal quality.",
  "G minor": "Serious and earnest with two flats. A Bach and Beethoven favourite — feels weighty without being hopeless.",
  "C minor": "Dramatic and stormy with three flats. Beethoven's 'heroic' key — intense, powerful, and transformative.",
};

const CHORD_PROGRESSION_EXPLANATIONS: Record<string, { name: string; description: string; examples: string }> = {
  "I-V-vi-IV": {
    name: "The Pop Progression",
    description: "The most popular chord progression in modern pop music. It creates a satisfying loop of tension and resolution that feels instantly familiar to Western ears.",
    examples: "Let It Be (Beatles), No Woman No Cry, With or Without You, Someone Like You",
  },
  "I-IV-V": {
    name: "The Blues/Rock Foundation",
    description: "The backbone of blues and early rock & roll. Three chords that create a complete harmonic world — tonic, subdominant, dominant.",
    examples: "Johnny B. Goode, La Bamba, Twist and Shout, countless 12-bar blues",
  },
  "ii-V-I": {
    name: "The Jazz Cadence",
    description: "The fundamental building block of jazz harmony. The ii–V creates tension that resolves powerfully to I — the 'gravitational pull' of jazz.",
    examples: "Autumn Leaves, All The Things You Are, Fly Me to the Moon",
  },
  "I-vi-IV-V": {
    name: "The '50s Progression",
    description: "The doo-wop and classic rock & roll staple. Feels nostalgic and romantic — emotionally straightforward with a looping quality.",
    examples: "Earth Angel, Stand By Me, Every Breath You Take",
  },
  "vi-IV-I-V": {
    name: "The Minor Pop Loop",
    description: "A darker cousin of the I-V-vi-IV — starts on the minor chord for an immediately melancholic or anthemic feel.",
    examples: "Demon Days, Numb, Radioactive, Wake Me Up",
  },
  "I-III-IV": {
    name: "The Triumphant Rise",
    description: "Starting on major, lifting through a major III chord creates an uplifting, victorious feeling — common in anthems and cinematic scores.",
    examples: "Don't Stop Believin', Eye of the Tiger, many film scores",
  },
};

function BpmExplanation({ bpm }: { bpm: number }) {
  let range: string;
  let feel: string;
  let genres: string;

  if (bpm < 60) {
    range = "Very slow (< 60 BPM)";
    feel = "Creates a spacious, contemplative feel — almost like time slowing down. Often used in ambient and drone music.";
    genres = "Ambient, Drone, Experimental, some Ballads";
  } else if (bpm < 80) {
    range = "Slow / Ballad (60–79 BPM)";
    feel = "The heartbeat tempo — calm and emotionally resonant. Perfect for ballads and reflective songs where lyrics take centre stage.";
    genres = "Ballads, Slow R&B, Gospel, some Country";
  } else if (bpm < 100) {
    range = "Mid-tempo (80–99 BPM)";
    feel = "Comfortable walking pace — feels natural and easy. Popular in soul, classic rock, and singer-songwriter material.";
    genres = "Soul, Classic Rock, Singer-songwriter, Acoustic Pop";
  } else if (bpm < 120) {
    range = "Moderate (100–119 BPM)";
    feel = "The sweet spot for mainstream pop — upbeat but not frenetic. Feels energetic without being exhausting.";
    genres = "Pop, Hip-Hop, R&B, Indie Pop, Folk Pop";
  } else if (bpm < 130) {
    range = "Uptempo (120–129 BPM)";
    feel = "Classic dance tempo — the heart rate of a dancefloor. 128 BPM is the most common tempo in house music.";
    genres = "House, Dance Pop, Disco, Tech House";
  } else if (bpm < 150) {
    range = "Fast (130–149 BPM)";
    feel = "High energy and driving — creates urgency and excitement. The territory of techno, drum & bass, and intense rock.";
    genres = "Techno, Electro, Hard Rock, Trance, Fast Hip-Hop";
  } else if (bpm < 180) {
    range = "Very fast (150–179 BPM)";
    feel = "Frantic energy — feels almost breathless. Used in metal, drum & bass, and intense electronic music.";
    genres = "Drum & Bass, Metal, Hardstyle, Punk";
  } else {
    range = "Extreme (180+ BPM)";
    feel = "Superhuman pace — at this speed the brain sometimes perceives it as half-time. Extreme metal and hardcore territory.";
    genres = "Hardcore, Gabber, Grindcore, Extreme Metal";
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-cyan-400 font-bold">{bpm} BPM</span>
        <span className="font-mono text-[10px] text-zinc-500">— {range}</span>
      </div>
      <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">{feel}</p>
      <p className="font-mono text-[10px] text-zinc-600">
        <span className="text-zinc-500">Common in: </span>{genres}
      </p>
    </div>
  );
}

function TooltipCard({
  icon,
  label,
  value,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-primary/12 bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-primary/4 transition-colors"
      >
        <span className="text-primary/50 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider block">{label}</span>
          <span className="font-mono text-[11px] text-zinc-200 leading-tight truncate block">{value}</span>
        </div>
        {open
          ? <ChevronUp className="w-3 h-3 text-zinc-600 shrink-0" />
          : <ChevronDown className="w-3 h-3 text-zinc-600 shrink-0" />
        }
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-primary/8 bg-primary/2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TheoryTooltips({ info, className }: TheoryTooltipsProps) {
  const [expanded, setExpanded] = useState(false);

  const hasContent = info.key || info.bpm || info.chordProgression || info.timeSignature;
  if (!hasContent) return null;

  const cardCount = [info.key, info.bpm, info.chordProgression, info.timeSignature].filter(Boolean).length;

  return (
    <div className={cn("w-full", className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-card border border-primary/12 hover:border-primary/25 hover:bg-primary/3 transition-all text-left"
      >
        <BookOpen className="w-3.5 h-3.5 text-primary/50 shrink-0" />
        <span className="flex-1 font-mono text-[10px] text-primary/50 uppercase tracking-widest">
          Music Theory
        </span>
        <span className="font-mono text-[10px] text-zinc-600">
          {cardCount} insight{cardCount !== 1 ? "s" : ""}
        </span>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" />
          : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
        }
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              {info.key && (
                <TooltipCard
                  icon={<Music2 className="w-3.5 h-3.5" />}
                  label="Key Signature"
                  value={info.key}
                >
                  {KEY_EXPLANATIONS[info.key] ? (
                    <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">
                      {KEY_EXPLANATIONS[info.key]}
                    </p>
                  ) : (
                    <p className="font-mono text-[10px] text-zinc-500">
                      {info.key.includes("minor")
                        ? "Minor keys tend to feel melancholic, dramatic, or introspective — they use a lowered third scale degree that creates an emotionally darker colour."
                        : "Major keys typically feel bright, resolved, and emotionally open — the raised third scale degree creates a sense of completeness."}
                    </p>
                  )}
                </TooltipCard>
              )}

              {info.bpm != null && (
                <TooltipCard
                  icon={<Gauge className="w-3.5 h-3.5" />}
                  label="Tempo (BPM)"
                  value={`${info.bpm} BPM`}
                >
                  <BpmExplanation bpm={info.bpm} />
                </TooltipCard>
              )}

              {info.chordProgression && (
                <TooltipCard
                  icon={<Piano className="w-3.5 h-3.5" />}
                  label="Chord Progression"
                  value={info.chordProgression}
                >
                  {(() => {
                    const exp = CHORD_PROGRESSION_EXPLANATIONS[info.chordProgression!];
                    return exp ? (
                      <div className="space-y-1.5">
                        <p className="font-mono text-[11px] text-cyan-400 font-bold">{exp.name}</p>
                        <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">{exp.description}</p>
                        <p className="font-mono text-[10px] text-zinc-600">
                          <span className="text-zinc-500">Famous uses: </span>{exp.examples}
                        </p>
                      </div>
                    ) : (
                      <p className="font-mono text-[10px] text-zinc-500 leading-relaxed">
                        Chord progressions are the harmonic backbone of a song — the sequence of chords that creates tension and release. Roman numerals indicate the scale degree (I = tonic, IV = subdominant, V = dominant).
                      </p>
                    );
                  })()}
                </TooltipCard>
              )}

              {info.timeSignature && (
                <TooltipCard
                  icon={<Hash className="w-3.5 h-3.5" />}
                  label="Time Signature"
                  value={info.timeSignature}
                >
                  <div className="space-y-1.5">
                    {info.timeSignature === "4/4" && (
                      <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">
                        4/4 — "Common time" — is used in ~90% of all popular music. Four beats per bar creates a natural, marching pulse that the human body intuitively responds to.
                      </p>
                    )}
                    {info.timeSignature === "3/4" && (
                      <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">
                        3/4 — "Waltz time" — has three beats per bar with a strong ONE-two-three feel. Creates a swaying, dancing quality — romantic and slightly nostalgic.
                      </p>
                    )}
                    {info.timeSignature === "6/8" && (
                      <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">
                        6/8 — Six eighth-note beats grouped as TWO groups of three. Feels like a compound waltz — flowing and lilting, common in folk and ballads.
                      </p>
                    )}
                    {info.timeSignature === "5/4" && (
                      <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">
                        5/4 — An asymmetric meter with five beats per bar. Creates an off-kilter, restless tension — famous in progressive rock and jazz. Think: Dave Brubeck's "Take Five".
                      </p>
                    )}
                    {!["4/4", "3/4", "6/8", "5/4"].includes(info.timeSignature!) && (
                      <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">
                        The time signature defines how many beats are in each bar and what note value gets one beat. Unusual time signatures create rhythmic complexity and forward momentum.
                      </p>
                    )}
                  </div>
                </TooltipCard>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
