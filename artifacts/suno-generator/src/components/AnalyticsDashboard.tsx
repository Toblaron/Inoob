import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2,
  ChevronDown,
  ChevronUp,
  Star,
  Zap,
  Music2,
  Smile,
  Piano,
  Clock,
  TrendingUp,
  Hash,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { SunoTemplate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const HISTORY_KEY = "suno-template-history";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHART_COLORS = ["#22d3ee", "#818cf8", "#f472b6", "#fb923c", "#34d399", "#fbbf24", "#f87171", "#a78bfa"];

interface HistoryEntry {
  id: string;
  timestamp: number;
  youtubeUrl: string;
  template: SunoTemplate;
  rating?: number | null;
  qualityScore?: number;
  usedOptions?: {
    genres?: string[];
    moods?: string[];
    instruments?: string[];
    energyLevel?: string;
    era?: string;
    tempo?: string;
  };
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function topN<T extends string>(arr: T[], n = 8): { name: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const item of arr) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: "primary" | "cyan" | "purple" | "orange";
}) {
  const colorMap = {
    primary: "text-primary/50",
    cyan: "text-cyan-400",
    purple: "text-purple-400",
    orange: "text-orange-400",
  };
  return (
    <div className="bg-zinc-900/50 border border-primary/12 px-4 py-3 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className={cn("shrink-0", colorMap[color])}>{icon}</span>
        <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">{label}</span>
      </div>
      <span className="font-mono text-xl font-bold text-white leading-tight">{value}</span>
      {sub && <span className="font-mono text-[10px] text-zinc-600">{sub}</span>}
    </div>
  );
}

function HBarChart({
  data,
  colorOffset = 0,
}: {
  data: { name: string; count: number }[];
  colorOffset?: number;
}) {
  if (data.length === 0) {
    return <p className="font-mono text-[11px] text-zinc-600 text-center py-6">No data yet</p>;
  }
  const max = data[0].count;
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={d.name} className="flex items-center gap-2">
          <span
            className="font-mono text-[10px] text-zinc-400 text-right shrink-0"
            style={{ width: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={d.name}
          >
            {d.name}
          </span>
          <div className="flex-1 bg-zinc-900 h-2 overflow-hidden">
            <motion.div
              className="h-full"
              style={{ backgroundColor: CHART_COLORS[(i + colorOffset) % CHART_COLORS.length] }}
              initial={{ width: 0 }}
              animate={{ width: `${(d.count / max) * 100}%` }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
            />
          </div>
          <span className="font-mono text-[10px] text-zinc-600 w-6 text-right shrink-0">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

type Tab = "overview" | "genres" | "moods" | "activity";

interface AnalyticsDashboardProps {
  className?: string;
}

export function AnalyticsDashboard({ className }: AnalyticsDashboardProps) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  // Increment to force analytics refresh when panel is re-opened
  const [refreshTick, setRefreshTick] = useState(0);

  const handleToggle = () => {
    setExpanded((v) => {
      if (!v) setRefreshTick((t) => t + 1); // refresh on open
      return !v;
    });
  };

  const analytics = useMemo(() => {
    void refreshTick; // track dependency
    const history = loadHistory();
    if (history.length === 0) return null;

    // Flatten used options from history
    const allGenres = history.flatMap((e) => e.usedOptions?.genres ?? []).filter(Boolean);
    const allMoods = history.flatMap((e) => e.usedOptions?.moods ?? []).filter(Boolean);
    const allInstruments = history.flatMap((e) => e.usedOptions?.instruments ?? []).filter(Boolean);
    const allEnergies = history.flatMap((e) => e.usedOptions?.energyLevel ? [e.usedOptions.energyLevel] : []);
    const allEras = history.flatMap((e) => e.usedOptions?.era ? [e.usedOptions.era] : []);

    const rated = history.filter((e) => e.rating != null && e.rating > 0);
    const avgRating = rated.length > 0
      ? (rated.reduce((s, e) => s + (e.rating ?? 0), 0) / rated.length).toFixed(1)
      : null;

    const scoredEntries = history.filter((e) => e.qualityScore != null);
    const avgScore = scoredEntries.length > 0
      ? Math.round(scoredEntries.reduce((s, e) => s + (e.qualityScore ?? 0), 0) / scoredEntries.length)
      : null;

    // Style prompt length distribution
    const avgStyleLen = Math.round(
      history.reduce((s, e) => s + (e.template.styleOfMusic?.length ?? 0), 0) / history.length
    );
    const avgLyricsLen = Math.round(
      history.reduce((s, e) => s + (e.template.lyrics?.length ?? 0), 0) / history.length
    );

    // Activity by day of week
    const byDay = new Array(7).fill(0) as number[];
    for (const e of history) {
      const day = new Date(e.timestamp).getDay();
      byDay[day]++;
    }
    const activityData = DAYS.map((day, i) => ({ day, count: byDay[i] }));

    // Top rated
    const topRated = [...history]
      .filter((e) => e.rating != null && e.rating >= 4)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 3);

    return {
      total: history.length,
      rated: rated.length,
      avgRating,
      avgScore,
      avgStyleLen,
      avgLyricsLen,
      topGenres: topN(allGenres),
      topMoods: topN(allMoods),
      topInstruments: topN(allInstruments, 6),
      topEnergies: topN(allEnergies, 5),
      topEras: topN(allEras, 5),
      activityData,
      topRated,
    };
  }, [refreshTick]); // Re-compute on each open to pick up fresh localStorage data

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <BarChart2 className="w-3 h-3" /> },
    { id: "genres", label: "Genres", icon: <Music2 className="w-3 h-3" /> },
    { id: "moods", label: "Moods", icon: <Smile className="w-3 h-3" /> },
    { id: "activity", label: "Activity", icon: <TrendingUp className="w-3 h-3" /> },
  ];

  return (
    <div className={cn("w-full bg-card border border-primary/15 overflow-hidden", className)}>
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left hover:bg-primary/3 transition-colors"
      >
        <BarChart2 className="w-4 h-4 text-primary/60 shrink-0" />
        <div className="flex-1">
          <span className="font-mono text-[10px] text-primary/50 uppercase tracking-widest block">Analytics Dashboard</span>
          <span className="font-mono text-[11px] text-zinc-400 leading-tight">
            Your generation patterns & history insights
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
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
              {!analytics ? (
                <div className="px-6 py-10 text-center">
                  <BarChart2 className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                  <p className="font-mono text-[11px] text-zinc-600">Generate some templates first — analytics will appear here.</p>
                </div>
              ) : (
                <>
                  {/* Tabs */}
                  <div className="flex border-b border-primary/10">
                    {TABS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                          "flex items-center gap-1.5 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider border-b-2 transition-all",
                          tab === t.id
                            ? "border-primary text-primary"
                            : "border-transparent text-zinc-600 hover:text-zinc-400"
                        )}
                      >
                        {t.icon}
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div className="p-4">
                    {/* Overview tab */}
                    {tab === "overview" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <StatCard
                            icon={<Hash className="w-3.5 h-3.5" />}
                            label="Total Generated"
                            value={analytics.total}
                            sub="templates"
                            color="primary"
                          />
                          <StatCard
                            icon={<Star className="w-3.5 h-3.5" />}
                            label="Avg Rating"
                            value={analytics.avgRating ?? "—"}
                            sub={`${analytics.rated} rated`}
                            color="orange"
                          />
                          <StatCard
                            icon={<Zap className="w-3.5 h-3.5" />}
                            label="Avg Quality Score"
                            value={analytics.avgScore != null ? `${analytics.avgScore}/100` : "—"}
                            sub="prompt optimizer"
                            color="cyan"
                          />
                          <StatCard
                            icon={<Clock className="w-3.5 h-3.5" />}
                            label="Avg Style Length"
                            value={analytics.avgStyleLen}
                            sub="chars (target: 900+)"
                            color="purple"
                          />
                        </div>

                        {/* Length bars */}
                        <div className="space-y-2 px-1">
                          <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Average field lengths</p>
                          {[
                            { label: "Style of Music", val: analytics.avgStyleLen, max: 999, target: "900–999" },
                            { label: "Lyrics / Metadata", val: analytics.avgLyricsLen, max: 4999, target: "4900–4999" },
                          ].map((row) => {
                            const pct = Math.min((row.val / row.max) * 100, 100);
                            const ok = row.val >= row.max - 100;
                            return (
                              <div key={row.label} className="flex items-center gap-2">
                                <span className="font-mono text-[10px] text-zinc-500 w-36 shrink-0">{row.label}</span>
                                <div className="flex-1 bg-zinc-900 h-2 overflow-hidden">
                                  <motion.div
                                    className={cn("h-full", ok ? "bg-green-500/70" : "bg-yellow-500/60")}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.5 }}
                                  />
                                </div>
                                <span className={cn(
                                  "font-mono text-[10px] w-24 text-right shrink-0",
                                  ok ? "text-green-400" : "text-yellow-400"
                                )}>
                                  {row.val.toLocaleString()} / {row.max.toLocaleString()}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Top rated */}
                        {analytics.topRated.length > 0 && (
                          <div>
                            <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider mb-2">Top Rated</p>
                            <div className="space-y-1">
                              {analytics.topRated.map((e) => (
                                <div key={e.id} className="flex items-center gap-2 px-3 py-2 bg-zinc-900/40 border border-primary/8">
                                  <Star className="w-3 h-3 text-yellow-400 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <span className="font-mono text-[11px] text-zinc-200 truncate block">{e.template.songTitle}</span>
                                    <span className="font-mono text-[10px] text-zinc-600 truncate block">{e.template.artist}</span>
                                  </div>
                                  <div className="flex shrink-0">
                                    {Array.from({ length: e.rating ?? 0 }).map((_, i) => (
                                      <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Genres tab */}
                    {tab === "genres" && (
                      <div className="space-y-4">
                        <div>
                          <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider mb-3">Top Genres Used</p>
                          <HBarChart data={analytics.topGenres} colorOffset={0} />
                        </div>
                        {analytics.topEnergies.length > 0 && (
                          <div>
                            <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider mb-2">Energy Levels</p>
                            <div className="flex flex-wrap gap-2">
                              {analytics.topEnergies.map((e, i) => (
                                <div
                                  key={e.name}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 border border-primary/15 bg-primary/4"
                                >
                                  <Zap
                                    className="w-3 h-3 shrink-0"
                                    style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}
                                  />
                                  <span className="font-mono text-[10px] text-zinc-300 capitalize">{e.name}</span>
                                  <span className="font-mono text-[10px] text-zinc-600">×{e.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {analytics.topEras.length > 0 && (
                          <div>
                            <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider mb-2">Eras</p>
                            <div className="flex flex-wrap gap-2">
                              {analytics.topEras.map((e, i) => (
                                <div
                                  key={e.name}
                                  className="flex items-center gap-1 px-2 py-1 border border-primary/10 text-zinc-400"
                                >
                                  <Clock
                                    className="w-2.5 h-2.5 shrink-0"
                                    style={{ color: CHART_COLORS[(i + 3) % CHART_COLORS.length] }}
                                  />
                                  <span className="font-mono text-[10px]">{e.name}</span>
                                  <span className="font-mono text-[10px] text-zinc-600">×{e.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Moods tab */}
                    {tab === "moods" && (
                      <div className="space-y-4">
                        <div>
                          <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider mb-3">Top Moods Used</p>
                          <HBarChart data={analytics.topMoods} colorOffset={2} />
                        </div>
                        {analytics.topInstruments.length > 0 && (
                          <div>
                            <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider mb-2">Top Instruments</p>
                            <div className="flex flex-wrap gap-2">
                              {analytics.topInstruments.map((inst, i) => (
                                <div
                                  key={inst.name}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 border border-primary/15"
                                >
                                  <Piano
                                    className="w-3 h-3 shrink-0"
                                    style={{ color: CHART_COLORS[(i + 4) % CHART_COLORS.length] }}
                                  />
                                  <span className="font-mono text-[10px] text-zinc-300">{inst.name}</span>
                                  <span className="font-mono text-[10px] text-zinc-600">×{inst.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Activity tab */}
                    {tab === "activity" && (
                      <div className="space-y-3">
                        <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Generations by Day of Week</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={analytics.activityData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                            <XAxis
                              dataKey="day"
                              tick={{ fontFamily: "monospace", fontSize: 10, fill: "#71717a" }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontFamily: "monospace", fontSize: 9, fill: "#52525b" }}
                              axisLine={false}
                              tickLine={false}
                              width={20}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "#09090b",
                                border: "1px solid rgba(0,229,255,0.15)",
                                fontFamily: "monospace",
                                fontSize: 11,
                                color: "#e4e4e7",
                              }}
                              cursor={{ fill: "rgba(0,229,255,0.05)" }}
                            />
                            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                              {analytics.activityData.map((entry, i) => (
                                <Cell
                                  key={`cell-${i}`}
                                  fill={entry.count > 0 ? CHART_COLORS[i % CHART_COLORS.length] : "#27272a"}
                                  fillOpacity={entry.count > 0 ? 0.8 : 0.4}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <p className="font-mono text-[10px] text-zinc-600 text-center">
                          {analytics.total} total generation{analytics.total !== 1 ? "s" : ""} tracked
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
