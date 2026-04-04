import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { BarChart2, Star, TrendingUp, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryEntry {
  id: string;
  timestamp: number;
  youtubeUrl: string;
  template: {
    songTitle: string;
    artist: string;
    styleOfMusic: string;
    lyrics: string;
    [key: string]: unknown;
  };
  rating?: number | null;
  usedOptions?: {
    genres?: string[];
    moods?: string[];
    instruments?: string[];
    energyLevel?: string;
    era?: string;
    tempo?: string;
    [key: string]: unknown;
  };
}

interface AnalyticsDashboardProps {
  history: HistoryEntry[];
  onClose: () => void;
  className?: string;
}

function topN<T extends string>(items: T[], n = 5): Array<{ label: T; count: number }> {
  const freq: Record<string, number> = {};
  for (const item of items) freq[item] = (freq[item] ?? 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label: label as T, count }));
}

function avgRating(history: HistoryEntry[]): number {
  const rated = history.filter((e) => typeof e.rating === "number");
  if (rated.length === 0) return 0;
  return rated.reduce((s, e) => s + (e.rating ?? 0), 0) / rated.length;
}

function byDayOfWeek(history: HistoryEntry[]): Array<{ day: string; count: number }> {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = new Array(7).fill(0);
  for (const e of history) counts[new Date(e.timestamp).getDay()]++;
  return days.map((day, i) => ({ day, count: counts[i] }));
}

function avgStyleLength(history: HistoryEntry[]): number {
  if (history.length === 0) return 0;
  return Math.round(history.reduce((s, e) => s + e.template.styleOfMusic.length, 0) / history.length);
}

function avgLyricsLength(history: HistoryEntry[]): number {
  if (history.length === 0) return 0;
  return Math.round(history.reduce((s, e) => s + e.template.lyrics.length, 0) / history.length);
}

const PRIMARY = "hsl(var(--primary))";

export function AnalyticsDashboard({ history, onClose, className }: AnalyticsDashboardProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "genres" | "moods" | "chart">("overview");

  const stats = useMemo(() => {
    const allGenres = history.flatMap((e) => e.usedOptions?.genres ?? []);
    const allMoods = history.flatMap((e) => e.usedOptions?.moods ?? []);
    const allInstruments = history.flatMap((e) => e.usedOptions?.instruments ?? []);
    const allEnergies = history.flatMap((e) => e.usedOptions?.energyLevel ? [e.usedOptions.energyLevel] : []);
    const allEras = history.flatMap((e) => e.usedOptions?.era ? [e.usedOptions.era] : []);

    return {
      total: history.length,
      rated: history.filter((e) => typeof e.rating === "number").length,
      avgRating: avgRating(history),
      topGenres: topN(allGenres, 8),
      topMoods: topN(allMoods, 8),
      topInstruments: topN(allInstruments, 6),
      topEnergies: topN(allEnergies, 5),
      topEras: topN(allEras, 5),
      byDay: byDayOfWeek(history),
      avgStyleLen: avgStyleLength(history),
      avgLyricsLen: avgLyricsLength(history),
      bestRated: history.filter((e) => (e.rating ?? 0) >= 4).slice(0, 3),
    };
  }, [history]);

  const TABS = [
    { id: "overview" as const, label: "Overview" },
    { id: "genres" as const, label: "Genres" },
    { id: "moods" as const, label: "Moods" },
    { id: "chart" as const, label: "Activity" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className={cn("bg-card border border-primary/25 overflow-hidden", className)}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-primary/10">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary/60" />
          <span className="font-mono text-[11px] text-primary/70 uppercase tracking-widest">Analytics</span>
          <span className="font-mono text-[10px] text-zinc-600">{stats.total} templates generated</span>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-primary/10">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 py-2 font-mono text-[10px] uppercase tracking-wider transition-colors",
              activeTab === tab.id ? "text-primary border-b border-primary" : "text-zinc-600 hover:text-zinc-400"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Top stats */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Total", value: stats.total, highlight: true },
                { label: "Rated", value: stats.rated },
                { label: "Avg Rating", value: stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "—" },
                { label: "Avg Style", value: `${stats.avgStyleLen}c` },
              ].map((stat) => (
                <div key={stat.label} className={cn(
                  "flex flex-col items-center py-2 border",
                  stat.highlight ? "border-primary/30 bg-primary/5" : "border-zinc-800"
                )}>
                  <span className={cn("font-mono text-xl font-bold", stat.highlight ? "text-primary" : "text-foreground")}>{stat.value}</span>
                  <span className="font-mono text-[9px] text-zinc-600 uppercase">{stat.label}</span>
                </div>
              ))}
            </div>

            {/* Average lengths */}
            <div className="space-y-2">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Average Template Quality</p>
              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="font-mono text-[9px] text-zinc-500">Style prompt avg</span>
                    <span className="font-mono text-[9px] text-zinc-500">{stats.avgStyleLen}/900</span>
                  </div>
                  <div className="h-1 bg-zinc-900 rounded-full">
                    <motion.div className="h-full bg-primary/60 rounded-full" initial={{ width: 0 }} animate={{ width: `${(stats.avgStyleLen / 900) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="font-mono text-[9px] text-zinc-500">Lyrics avg</span>
                    <span className="font-mono text-[9px] text-zinc-500">{stats.avgLyricsLen}/4999</span>
                  </div>
                  <div className="h-1 bg-zinc-900 rounded-full">
                    <motion.div className="h-full bg-primary/60 rounded-full" initial={{ width: 0 }} animate={{ width: `${(stats.avgLyricsLen / 4999) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Best rated */}
            {stats.bestRated.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Top Rated</p>
                {stats.bestRated.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 border border-primary/15 bg-primary/3">
                    <Star className="w-3 h-3 text-primary/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs font-bold truncate">{e.template.songTitle}</p>
                      <p className="font-mono text-[9px] text-zinc-500 truncate">{e.usedOptions?.genres?.join(", ")}</p>
                    </div>
                    <span className="font-mono text-xs text-primary font-bold">{e.rating}★</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "genres" && (
          <div className="space-y-3">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Most Used Genres</p>
            {stats.topGenres.length === 0 ? (
              <p className="font-mono text-[11px] text-zinc-600">No genre data yet — generate templates with genres selected.</p>
            ) : (
              <div className="space-y-1.5">
                {stats.topGenres.map((item, i) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-zinc-600 w-4 text-right">{i + 1}</span>
                    <div className="flex-1 h-5 bg-zinc-900 relative overflow-hidden">
                      <motion.div
                        className="h-full bg-primary/20"
                        initial={{ width: 0 }}
                        animate={{ width: `${(item.count / (stats.topGenres[0]?.count ?? 1)) * 100}%` }}
                        transition={{ delay: i * 0.05 }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 font-mono text-[10px] text-zinc-300">{item.label}</span>
                    </div>
                    <span className="font-mono text-[10px] text-zinc-500 w-5 text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 space-y-1.5">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Top Energies</p>
              <div className="flex flex-wrap gap-1">
                {stats.topEnergies.map((e) => (
                  <span key={e.label} className="font-mono text-[10px] px-2 py-0.5 border border-primary/20 text-zinc-400">
                    {e.label} <span className="text-primary">×{e.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "moods" && (
          <div className="space-y-3">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Most Used Moods</p>
            {stats.topMoods.length === 0 ? (
              <p className="font-mono text-[11px] text-zinc-600">No mood data yet.</p>
            ) : (
              <div className="space-y-1.5">
                {stats.topMoods.map((item, i) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-zinc-600 w-4 text-right">{i + 1}</span>
                    <div className="flex-1 h-5 bg-zinc-900 relative overflow-hidden">
                      <motion.div
                        className="h-full bg-purple-500/15"
                        initial={{ width: 0 }}
                        animate={{ width: `${(item.count / (stats.topMoods[0]?.count ?? 1)) * 100}%` }}
                        transition={{ delay: i * 0.05 }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 font-mono text-[10px] text-zinc-300">{item.label}</span>
                    </div>
                    <span className="font-mono text-[10px] text-zinc-500 w-5 text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 space-y-1.5">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Top Instruments</p>
              <div className="flex flex-wrap gap-1">
                {stats.topInstruments.map((e) => (
                  <span key={e.label} className="font-mono text-[10px] px-2 py-0.5 border border-purple-500/20 text-zinc-400">
                    {e.label} <span className="text-purple-400">×{e.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "chart" && (
          <div className="space-y-3">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Generation by Day of Week</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stats.byDay} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#000", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "monospace", fontSize: 10 }}
                  labelStyle={{ color: PRIMARY }}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {stats.byDay.map((entry, i) => (
                    <Cell key={i} fill={entry.count > 0 ? PRIMARY : "rgba(255,255,255,0.06)"} fillOpacity={entry.count > 0 ? 0.7 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </motion.div>
  );
}
