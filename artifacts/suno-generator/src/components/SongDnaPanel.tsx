import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Dna, GitCompare, Blend, Trash2, CheckCircle } from "lucide-react";
import type { SongFingerprint } from "@workspace/api-client-react";
import { RadarChart, DoubleRadarChart, type RadarAxis } from "./RadarChart";
import { cn } from "@/lib/utils";

const FINGERPRINT_HISTORY_KEY = "suno-fingerprint-history";
const MAX_FINGERPRINTS = 5;

type StoredFingerprint = SongFingerprint & {
  videoId: string;
  songTitle: string;
  artist: string;
  computedAt: number;
};

function loadFingerprintHistory(): StoredFingerprint[] {
  try {
    const raw = localStorage.getItem(FINGERPRINT_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as StoredFingerprint[]) : [];
  } catch {
    return [];
  }
}

function saveFingerprintHistory(entries: StoredFingerprint[]) {
  try {
    localStorage.setItem(FINGERPRINT_HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_FINGERPRINTS)));
  } catch {}
}

function buildAxes(fp: SongFingerprint): RadarAxis[] {
  return [
    {
      key: "energy",
      label: "Energy",
      value: fp.energy,
      tooltip: `${fp.energy}/10 — ${fp.energy >= 8 ? "High BPM + loud dynamics suggest intense energy" : fp.energy >= 6 ? "Moderate-high energy with driving momentum" : fp.energy >= 4 ? "Balanced energy — neither chill nor intense" : "Low energy, calm or ambient feel"}`,
    },
    {
      key: "tempoFeel",
      label: "Tempo Feel",
      value: fp.tempoFeel,
      tooltip: `${fp.tempoFeel}/10 — ${fp.tempoFeel >= 8 ? "Very fast — high BPM, frenetic pace" : fp.tempoFeel >= 6 ? "Uptempo feel — danceable and driving" : fp.tempoFeel >= 4 ? "Mid-tempo — steady and comfortable" : "Slow tempo — ballad or downtempo feel"}`,
    },
    {
      key: "vocalPresence",
      label: "Vocals",
      value: fp.vocalPresence,
      tooltip: `${fp.vocalPresence}/10 — ${fp.vocalPresence === 0 ? "Purely instrumental — no vocals present" : fp.vocalPresence >= 8 ? "Strong, prominent vocals dominating the mix" : fp.vocalPresence >= 5 ? "Vocals present and clear in the mix" : "Vocals subdued or lightly present"}`,
    },
    {
      key: "instrumentalComplexity",
      label: "Complexity",
      value: fp.instrumentalComplexity,
      tooltip: `${fp.instrumentalComplexity}/10 — ${fp.instrumentalComplexity >= 8 ? "Rich, complex arrangement — orchestral or jazz-level instrumentation" : fp.instrumentalComplexity >= 6 ? "Moderately complex — multiple distinct instrument layers" : fp.instrumentalComplexity >= 4 ? "Moderate — standard band or producer setup" : "Minimal — sparse, simple arrangement"}`,
    },
    {
      key: "eraAuthenticity",
      label: "Era Bond",
      value: fp.eraAuthenticity,
      tooltip: `${fp.eraAuthenticity}/10 — ${fp.eraAuthenticity >= 8 ? "Strongly era-coded — unmistakably tied to a specific decade" : fp.eraAuthenticity >= 5 ? "Moderately era-coded — references a clear period" : "Genre-first — era influence is subtle or mixed"}`,
    },
    {
      key: "moodValence",
      label: "Valence",
      value: fp.moodValence,
      tooltip: `${fp.moodValence}/10 — ${fp.moodValence >= 8 ? "Bright, positive, happy energy" : fp.moodValence >= 6 ? "Warm and generally uplifting" : fp.moodValence >= 4 ? "Bittersweet or emotionally neutral" : "Dark, melancholic, or heavy emotional tone"}`,
    },
    {
      key: "genrePurity",
      label: "Genre Purity",
      value: fp.genrePurity,
      tooltip: `${fp.genrePurity}/10 — ${fp.genrePurity >= 8 ? "Pure genre focus — stays firmly within one style" : fp.genrePurity >= 5 ? "Moderately genre-defined with some crossover" : "Cross-genre fusion — blends multiple styles"}`,
    },
  ];
}

function blendFingerprints(a: SongFingerprint, b: SongFingerprint): SongFingerprint {
  return {
    energy: Math.round(((a.energy + b.energy) / 2) * 10) / 10,
    tempoFeel: Math.round(((a.tempoFeel + b.tempoFeel) / 2) * 10) / 10,
    vocalPresence: Math.round(((a.vocalPresence + b.vocalPresence) / 2) * 10) / 10,
    instrumentalComplexity: Math.round(((a.instrumentalComplexity + b.instrumentalComplexity) / 2) * 10) / 10,
    eraAuthenticity: Math.round(((a.eraAuthenticity + b.eraAuthenticity) / 2) * 10) / 10,
    moodValence: Math.round(((a.moodValence + b.moodValence) / 2) * 10) / 10,
    genrePurity: Math.round(((a.genrePurity + b.genrePurity) / 2) * 10) / 10,
    songTitle: `Blend: ${a.songTitle ?? "Song A"} × ${b.songTitle ?? "Song B"}`,
    artist: `${a.artist ?? ""} × ${b.artist ?? ""}`,
    computedAt: Date.now(),
  };
}

interface SongDnaPanelProps {
  fingerprint: SongFingerprint;
  videoId?: string;
  songTitle: string;
  artist: string;
  onBlendGenerate?: (blendedFingerprint: SongFingerprint, targetEnergy: string, targetTempo: string) => void;
}

export function SongDnaPanel({
  fingerprint,
  videoId,
  songTitle,
  artist,
  onBlendGenerate,
}: SongDnaPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [history, setHistory] = useState<StoredFingerprint[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [blendPending, setBlendPending] = useState(false);

  const currentFp: StoredFingerprint = {
    ...fingerprint,
    videoId: videoId ?? songTitle,
    songTitle,
    artist,
    computedAt: fingerprint.computedAt ?? Date.now(),
  };

  useEffect(() => {
    const prev = loadFingerprintHistory();
    const filteredPrev = prev.filter((p) => p.videoId !== (videoId ?? songTitle));
    const updated = [currentFp, ...filteredPrev].slice(0, MAX_FINGERPRINTS);
    saveFingerprintHistory(updated);
    setHistory(updated);
  }, [fingerprint, videoId, songTitle]);

  const deleteEntry = useCallback((vid: string) => {
    setHistory((prev) => {
      const updated = prev.filter((p) => p.videoId !== vid);
      saveFingerprintHistory(updated);
      return updated;
    });
    setSelectedForCompare((prev) => prev.filter((v) => v !== vid));
  }, []);

  const toggleCompareSelect = (vid: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(vid)) return prev.filter((v) => v !== vid);
      if (prev.length >= 2) return [prev[1], vid];
      return [...prev, vid];
    });
  };

  const currentAxes = buildAxes(currentFp);

  const compareEntries = selectedForCompare.length === 2
    ? [history.find((h) => h.videoId === selectedForCompare[0]), history.find((h) => h.videoId === selectedForCompare[1])]
    : null;

  const canCompare = selectedForCompare.length === 2 && compareEntries && compareEntries[0] && compareEntries[1];

  const handleBlend = () => {
    if (!canCompare || !compareEntries[0] || !compareEntries[1]) return;
    const blended = blendFingerprints(compareEntries[0], compareEntries[1]);
    const energyMap: Record<number, string> = { 2: "chill", 4: "medium", 6: "medium", 7: "high", 8: "high", 9: "intense", 10: "intense" };
    const tempoMap: Record<number, string> = { 1: "ballad", 2: "slow", 4: "mid", 5: "groove", 7: "uptempo", 8: "fast", 10: "hyper" };
    const energyKey = Math.round(blended.energy);
    const tempoKey = Math.round(blended.tempoFeel);
    const targetEnergy = energyMap[energyKey] ?? (blended.energy > 7 ? "high" : blended.energy > 4 ? "medium" : "chill");
    const targetTempo = tempoMap[tempoKey] ?? (blended.tempoFeel > 7 ? "fast" : blended.tempoFeel > 4 ? "uptempo" : "mid");
    setBlendPending(true);
    setTimeout(() => setBlendPending(false), 2000);
    onBlendGenerate?.(blended, targetEnergy, targetTempo);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-primary/15 overflow-hidden"
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-primary/5 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Dna className="w-4 h-4 text-primary" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-primary">Song DNA Fingerprint</span>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 1 && (
            <span className="font-mono text-[9px] text-zinc-500 border border-zinc-700 px-1.5 py-0.5">
              {history.length} saved
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <div className="px-5 pb-5 border-t border-primary/10">
              <div className="flex flex-col lg:flex-row gap-6 pt-5">
                {/* Current fingerprint chart */}
                <div className="flex flex-col items-center gap-3">
                  <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">Current Song</span>
                  <RadarChart axes={currentAxes} size={280} />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full max-w-[200px]">
                    {currentAxes.map((axis) => (
                      <div key={axis.key} className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[8.5px] text-zinc-500 truncate">{axis.label}</span>
                        <span className="font-mono text-[8.5px] text-primary tabular-nums">{axis.value.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* History + compare panel */}
                {history.length > 1 && (
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">Saved Fingerprints</span>
                      <button
                        onClick={() => { setCompareMode((v) => !v); setSelectedForCompare([]); }}
                        className={cn(
                          "flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-2 py-1 border transition-all",
                          compareMode
                            ? "border-primary/50 text-primary bg-primary/10"
                            : "border-zinc-700 text-zinc-500 hover:border-primary/40 hover:text-primary"
                        )}
                      >
                        <GitCompare className="w-2.5 h-2.5" />
                        {compareMode ? "Exit Compare" : "Compare"}
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {history.map((entry) => {
                        const isCurrent = entry.videoId === (videoId ?? songTitle);
                        const isSelected = selectedForCompare.includes(entry.videoId);
                        return (
                          <div
                            key={entry.videoId}
                            className={cn(
                              "flex items-center justify-between px-3 py-2 border transition-all",
                              compareMode && "cursor-pointer hover:border-primary/40",
                              isSelected ? "border-primary/50 bg-primary/8" : "border-zinc-800 bg-zinc-900/40",
                              isCurrent && !compareMode && "border-primary/25"
                            )}
                            onClick={() => compareMode && toggleCompareSelect(entry.videoId)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {compareMode && (
                                <div className={cn(
                                  "w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0",
                                  isSelected ? "border-primary bg-primary/20" : "border-zinc-600"
                                )}>
                                  {isSelected && <CheckCircle className="w-2.5 h-2.5 text-primary" />}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-mono text-[10px] text-zinc-300 truncate">
                                  {entry.songTitle}
                                  {isCurrent && <span className="text-primary ml-1">•</span>}
                                </div>
                                <div className="font-mono text-[8.5px] text-zinc-600 truncate">{entry.artist}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="hidden sm:flex gap-1">
                                {(["energy", "tempoFeel", "moodValence"] as const).map((k) => {
                                  const val = entry[k] as number;
                                  return (
                                    <div key={k} className="flex flex-col items-center gap-0.5">
                                      <div
                                        className="w-1 rounded-sm"
                                        style={{
                                          height: `${Math.round(val * 1.6)}px`,
                                          background: "hsl(188 100% 50%)",
                                          opacity: 0.6 + val / 25,
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              {!compareMode && !isCurrent && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteEntry(entry.videoId); }}
                                  className="p-1 text-zinc-700 hover:text-red-400 transition-colors"
                                  title="Remove from history"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Compare view */}
                    {compareMode && canCompare && compareEntries[0] && compareEntries[1] && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 flex flex-col items-center gap-4"
                      >
                        <div className="w-full border-t border-primary/10 pt-4">
                          <DoubleRadarChart
                            axesA={buildAxes(compareEntries[0])}
                            axesB={buildAxes(compareEntries[1])}
                            labelA={compareEntries[0].songTitle}
                            labelB={compareEntries[1].songTitle}
                            size={280}
                          />
                        </div>

                        {onBlendGenerate && (
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={handleBlend}
                              disabled={blendPending}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 font-mono text-[10px] uppercase tracking-wider border transition-all",
                                blendPending
                                  ? "border-primary/50 text-primary bg-primary/10"
                                  : "border-primary/30 text-zinc-400 hover:border-primary hover:text-primary"
                              )}
                            >
                              <Blend className="w-3 h-3" />
                              {blendPending ? "Blend applied!" : "Apply Blend Settings"}
                            </button>
                            {blendPending && (
                              <p className="font-mono text-[9px] text-primary/70">
                                Energy &amp; tempo controls updated — click Generate to create the hybrid
                              </p>
                            )}
                            {!blendPending && (
                              <p className="font-mono text-[9px] text-zinc-600">
                                Averages both fingerprints and sets energy + tempo for your next generation
                              </p>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}

                    {compareMode && selectedForCompare.length < 2 && (
                      <p className="font-mono text-[9px] text-zinc-600 text-center">
                        Select {2 - selectedForCompare.length} more to compare
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
