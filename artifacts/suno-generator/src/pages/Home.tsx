import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import LZString from "lz-string";
import {
  Youtube,
  Wand2,
  AlertCircle,
  ChevronDown,
  Mic2,
  Zap,
  Clock,
  Music2,
  FileText,
  History,
  Trash2,
  Tags,
  Shuffle,
  Share2,
  Check,
  Layers,
  Piano,
  Ban,
  Gauge,
  Smile,
} from "lucide-react";
import { useGenerateSunoTemplate } from "@workspace/api-client-react";
import type { SunoTemplate } from "@workspace/api-client-react";
import { TemplateResult } from "@/components/TemplateResult";
import { LoadingEq } from "@/components/LoadingEq";
import { cn } from "@/lib/utils";

const HISTORY_KEY = "suno-template-history";
const MAX_HISTORY = 10;
const MAX_GENRES = 5;
const MAX_MOODS = 3;
const MAX_INSTRUMENTS = 4;

const MOOD_TAGS = ["Dark", "Euphoric", "Nostalgic", "Melancholic", "Aggressive", "Romantic", "Dreamy", "Rebellious", "Playful", "Mysterious", "Cinematic", "Hopeful"];
const INSTRUMENT_TAGS = ["Piano", "Guitar", "Synth", "Strings", "Bass", "Choir", "Brass", "Drums", "Violin", "Flute", "Organ", "Sitar"];
const NEGATIVE_PRESETS: { label: string; value: string }[] = [
  { label: "No rap vocals", value: "no rap" },
  { label: "No autotune", value: "no autotune" },
  { label: "No heavy distortion", value: "no heavy distortion" },
  { label: "No spoken word", value: "no spoken word" },
  { label: "No choir", value: "no choir" },
  { label: "No orchestral", value: "no orchestral" },
  { label: "No 8-bit / chiptune", value: "no 8-bit,no chiptune" },
  { label: "No drums", value: "no drums" },
  { label: "No bass", value: "no bass" },
  { label: "No electric guitar", value: "no electric guitar" },
  { label: "No piano", value: "no piano" },
  { label: "No synthesizer", value: "no synthesizer" },
  { label: "No jazz influence", value: "no jazz" },
  { label: "No country influence", value: "no country" },
  { label: "No EDM / club beat", value: "no EDM,no club beat" },
  { label: "No ambient pads", value: "no ambient pads" },
];

interface GenreCategory {
  label: string;
  genres: string[];
}

const GENRE_CATEGORIES: GenreCategory[] = [
  { label: "Pop", genres: ["Pop", "Dance Pop", "Indie Pop", "Electropop", "Synth-Pop", "Dream Pop", "Chamber Pop", "Baroque Pop", "Britpop", "Power Pop", "Teen Pop", "Art Pop", "Bedroom Pop", "Chillout Pop"] },
  { label: "Rock", genres: ["Rock", "Alternative Rock", "Indie Rock", "Hard Rock", "Classic Rock", "Punk", "Post-Punk", "Grunge", "Shoegaze", "Psychedelic Rock", "Progressive Rock", "Garage Rock", "Folk Rock", "Blues-Rock", "Arena Rock", "New Wave", "Emo", "Post-Rock", "Stoner Rock"] },
  { label: "Electronic", genres: ["Electronic", "House", "Deep House", "Tech House", "Techno", "Synthwave", "Lo-Fi", "Drum & Bass", "Dubstep", "EDM", "Trance", "IDM", "Industrial", "Vaporwave", "Chillwave", "Future Bass", "Glitch Hop", "Electro", "Breakbeat"] },
  { label: "Hip-Hop", genres: ["Hip-Hop", "Trap", "Rap", "Drill", "Boom Bap", "Gangsta Rap", "G-Funk", "Conscious Hip-Hop", "Lo-Fi Hip-Hop", "Grime", "Cloud Rap", "East Coast", "West Coast Rap", "Golden Age Hip Hop", "Jazz Rap", "Phonk"] },
  { label: "R&B / Soul", genres: ["R&B", "Soul", "Neo-Soul", "Funk", "Disco", "Motown", "Gospel", "Contemporary R&B", "Quiet Storm", "Psychedelic Soul", "New Jack Swing"] },
  { label: "Jazz", genres: ["Jazz", "Smooth Jazz", "Bebop", "Swing", "Jazz Fusion", "Big Band", "Acid Jazz", "Cool Jazz", "Modal Jazz", "Latin Jazz", "Free Jazz", "Nu Jazz"] },
  { label: "Metal", genres: ["Metal", "Heavy Metal", "Black Metal", "Death Metal", "Thrash Metal", "Nu Metal", "Metalcore", "Power Metal", "Doom Metal", "Symphonic Metal", "Groove Metal", "Djent", "Deathcore", "Progressive Metal", "Folk Metal"] },
  { label: "Country / Folk", genres: ["Country", "Americana", "Bluegrass", "Folk", "Indie Folk", "Outlaw Country", "Country Rock", "Country Pop", "Contemporary Folk", "Alt-Country", "Honky Tonk", "Western Swing"] },
  { label: "Classical", genres: ["Classical", "Orchestral", "Baroque", "Cinematic", "Film Score", "Chamber Music", "Opera", "Neo-Classical", "Minimalist", "Romantic"] },
  { label: "World / Other", genres: ["K-Pop", "Afrobeats", "Reggae", "Dancehall", "Reggaeton", "Latin Pop", "Bossa Nova", "Flamenco", "Salsa", "Cumbia", "Afropop", "Afro-Cuban", "J-Pop", "Tropical", "Ska", "Dub"] },
  { label: "Blues", genres: ["Blues", "Delta Blues", "Chicago Blues", "Electric Blues", "Soul Blues", "Blues Rock", "Jump Blues", "Swamp Blues"] },
  { label: "New Age / Ambient", genres: ["New Age", "Ambient", "Meditation", "Healing", "Dark Ambient", "Space Music"] },
];

const ALL_GENRES = GENRE_CATEGORIES.flatMap((c) => c.genres);
const ALL_ERAS = ["70s", "80s", "90s", "2000s", "modern"] as const;
const ALL_ENERGIES = ["chill", "medium", "high"] as const;
const ALL_TEMPOS = ["slow", "mid", "uptempo", "fast"] as const;
const ALL_GENDERS = ["male", "female"] as const;

interface HistoryEntry {
  id: string;
  timestamp: number;
  youtubeUrl: string;
  template: SunoTemplate;
}

interface VideoPreview {
  title: string;
  author: string;
  thumbnail: string | null;
  duration: string | null;
}

interface SharedState {
  youtubeUrl: string;
  template: SunoTemplate;
}

const formSchema = z.object({
  youtubeUrl: z
    .string()
    .url("Please enter a valid URL")
    .refine(
      (url) => url.includes("youtube.com") || url.includes("youtu.be"),
      "Must be a valid YouTube URL (youtube.com or youtu.be)"
    ),
});

type FormValues = z.infer<typeof formSchema>;

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {}
}

function encodeShareState(state: SharedState): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

function decodeShareState(encoded: string): SharedState | null {
  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    if (!decompressed) return null;
    return JSON.parse(decompressed) as SharedState;
  } catch {
    return null;
  }
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Home() {
  const mainMutation = useGenerateSunoTemplate();
  const varBMutation = useGenerateSunoTemplate();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { youtubeUrl: "" },
  });

  const [currentTemplate, setCurrentTemplate] = useState<SunoTemplate | null>(null);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [showStyleControls, setShowStyleControls] = useState(false);
  const [showManualLyrics, setShowManualLyrics] = useState(false);
  const [showNegBuilder, setShowNegBuilder] = useState(false);
  const [manualLyrics, setManualLyrics] = useState("");
  const [vocalGender, setVocalGender] = useState<"auto" | "male" | "female">("auto");
  const [energyLevel, setEnergyLevel] = useState<"auto" | "chill" | "medium" | "high">("auto");
  const [era, setEra] = useState<"auto" | "70s" | "80s" | "90s" | "2000s" | "modern">("auto");
  const [genreNudge, setGenreNudge] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [expandedGenreCategory, setExpandedGenreCategory] = useState<string | null>(null);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);
  const [mode, setMode] = useState<"cover" | "inspired" | null>(null);
  const [tempo, setTempo] = useState<"slow" | "mid" | "uptempo" | "fast" | null>(null);
  const [excludeTags, setExcludeTags] = useState<string[]>([]);

  const [videoPreview, setVideoPreview] = useState<VideoPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [variationA, setVariationA] = useState<SunoTemplate | null>(null);
  const [variationB, setVariationB] = useState<SunoTemplate | null>(null);
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const [selectedVariation, setSelectedVariation] = useState<"A" | "B" | null>(null);
  const [showVariations, setShowVariations] = useState(false);

  const [shareToast, setShareToast] = useState<"idle" | "copied">("idle");
  const [clipboardToast, setClipboardToast] = useState(false);

  const lastUrlRef = useRef<string>("");
  const lastOptionsRef = useRef<object>({});
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHistory(loadHistory());

    const hash = window.location.hash.slice(1);
    if (hash) {
      const decoded = decodeShareState(hash);
      if (decoded) {
        form.setValue("youtubeUrl", decoded.youtubeUrl);
        setCurrentTemplate(decoded.template);
        lastUrlRef.current = decoded.youtubeUrl;
        fetchVideoPreview(decoded.youtubeUrl);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  useEffect(() => {
    const handleFocus = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (
          (text.includes("youtube.com/watch") || text.includes("youtu.be/")) &&
          !form.getValues("youtubeUrl")
        ) {
          form.setValue("youtubeUrl", text.trim());
          setClipboardToast(true);
          setTimeout(() => setClipboardToast(false), 3000);
        }
      } catch {}
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const fetchVideoPreview = useCallback(async (url: string) => {
    const id = extractVideoId(url);
    if (!id) return;
    const thumb = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
    setVideoPreview((prev) => prev ? { ...prev, thumbnail: thumb } : { title: "", author: "", thumbnail: thumb, duration: null });
    setPreviewLoading(true);
    try {
      const resp = await fetch(`/api/suno/youtube-preview?url=${encodeURIComponent(url)}`);
      if (resp.ok) {
        const data = await resp.json() as VideoPreview;
        setVideoPreview({ ...data, thumbnail: thumb });
      }
    } catch {}
    setPreviewLoading(false);
  }, []);

  const urlValue = form.watch("youtubeUrl");
  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    const id = extractVideoId(urlValue ?? "");
    if (!id) {
      setVideoPreview(null);
      return;
    }
    setVideoPreview((prev) => prev ?? { title: "", author: "", thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`, duration: null });
    previewTimerRef.current = setTimeout(() => fetchVideoPreview(urlValue), 800);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [urlValue, fetchVideoPreview]);

  const addToHistory = (url: string, template: SunoTemplate) => {
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      youtubeUrl: url,
      template,
    };
    setHistory((prev) => {
      const next = [entry, ...prev.filter((e) => e.youtubeUrl !== url)].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  };

  function toggleSet<T extends string>(prev: T[], value: T, max: number): T[] {
    if (prev.includes(value)) return prev.filter((v) => v !== value);
    if (prev.length >= max) return prev;
    return [...prev, value];
  }

  const buildOptions = () => ({
    manualLyrics: manualLyrics.trim() || undefined,
    vocalGender: vocalGender !== "auto" ? vocalGender : undefined,
    energyLevel: energyLevel !== "auto" ? energyLevel : undefined,
    era: era !== "auto" ? era : undefined,
    genreNudge: genreNudge.trim() || undefined,
    genres: selectedGenres.length > 0 ? selectedGenres : undefined,
    moods: selectedMoods.length > 0 ? selectedMoods : undefined,
    instruments: selectedInstruments.length > 0 ? selectedInstruments : undefined,
    mode: mode ?? undefined,
    tempo: tempo ?? undefined,
    excludeTags: excludeTags.length > 0 ? excludeTags : undefined,
  });

  const handleSurpriseMe = () => {
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const pickN = <T,>(arr: T[], n: number): T[] => {
      const shuffled = [...arr].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, n);
    };
    setSelectedGenres(pickN(ALL_GENRES, Math.floor(Math.random() * 3) + 1));
    setSelectedMoods(pickN(MOOD_TAGS, Math.floor(Math.random() * 2) + 1));
    setSelectedInstruments(pickN(INSTRUMENT_TAGS, Math.floor(Math.random() * 3) + 1));
    setVocalGender(pick(["auto", ...ALL_GENDERS]));
    setEnergyLevel(pick(["auto", ...ALL_ENERGIES]));
    setEra(pick(["auto", ...ALL_ERAS]));
    setTempo(pick(ALL_TEMPOS));
    setMode(pick(["cover", "inspired"]));
    if (!showStyleControls) setShowStyleControls(true);
  };

  const handleShareTemplate = () => {
    if (!currentTemplate || !lastUrlRef.current) return;
    const encoded = encodeShareState({ youtubeUrl: lastUrlRef.current, template: currentTemplate });
    const shareUrl = `${window.location.origin}${window.location.pathname}#${encoded}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShareToast("copied");
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      shareTimerRef.current = setTimeout(() => setShareToast("idle"), 2500);
    });
  };

  const onSubmit = (values: FormValues) => {
    lastUrlRef.current = values.youtubeUrl;
    lastOptionsRef.current = buildOptions();
    setApiError(null);
    setRegeneratingSection(null);
    setShowVariations(false);
    setVariationA(null);
    setVariationB(null);
    setSelectedVariation(null);
    mainMutation.mutate(
      { data: { youtubeUrl: values.youtubeUrl, ...buildOptions() } },
      {
        onSuccess: (data) => {
          setCurrentTemplate(data);
          addToHistory(values.youtubeUrl, data);
        },
        onError: (err) => {
          setApiError((err as { data?: { error?: string }; message?: string })?.data?.error ?? (err as Error)?.message ?? "Something went wrong");
        },
      }
    );
  };

  const handleGenerateVariations = () => {
    if (!lastUrlRef.current) return;
    const opts = lastOptionsRef.current as object;
    setIsGeneratingVariations(true);
    setVariationA(null);
    setVariationB(null);
    setSelectedVariation(null);
    setShowVariations(true);
    setApiError(null);

    let aSettled = false;
    let bSettled = false;
    const checkDone = () => { if (aSettled && bSettled) setIsGeneratingVariations(false); };

    mainMutation.mutate(
      { data: { youtubeUrl: lastUrlRef.current, ...opts, variationIndex: 1 } },
      {
        onSuccess: (data) => { setVariationA(data); aSettled = true; checkDone(); },
        onError: () => { aSettled = true; checkDone(); },
      }
    );
    varBMutation.mutate(
      { data: { youtubeUrl: lastUrlRef.current, ...opts, variationIndex: 2 } },
      {
        onSuccess: (data) => { setVariationB(data); bSettled = true; checkDone(); },
        onError: () => { bSettled = true; checkDone(); },
      }
    );
  };

  const handleUseVariation = (v: "A" | "B") => {
    const t = v === "A" ? variationA : variationB;
    if (t) {
      setCurrentTemplate(t);
      setSelectedVariation(v);
      setShowVariations(false);
    }
  };

  const handleRegenerateSection = (section: keyof SunoTemplate) => {
    if (!lastUrlRef.current) return;
    setRegeneratingSection(section as string);
    setApiError(null);
    mainMutation.mutate(
      { data: { youtubeUrl: lastUrlRef.current, ...(lastOptionsRef.current as object) } },
      {
        onSuccess: (newData) => {
          setCurrentTemplate((prev) =>
            prev ? { ...prev, [section]: newData[section] } : newData
          );
          setRegeneratingSection(null);
        },
        onError: () => setRegeneratingSection(null),
      }
    );
  };

  const handleLoadHistory = (entry: HistoryEntry) => {
    form.setValue("youtubeUrl", entry.youtubeUrl);
    lastUrlRef.current = entry.youtubeUrl;
    setCurrentTemplate(entry.template);
    setShowHistory(false);
    setShowVariations(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const isLoading = mainMutation.isPending && !regeneratingSection && !isGeneratingVariations;

  const styleActiveCount = [
    vocalGender !== "auto",
    energyLevel !== "auto",
    era !== "auto",
    genreNudge.trim().length > 0,
    selectedGenres.length > 0,
    selectedMoods.length > 0,
    selectedInstruments.length > 0,
    tempo !== null,
  ].filter(Boolean).length;

  const negActiveCount = excludeTags.length;

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-start pt-20 px-4 pb-24 overflow-x-hidden">
      <div
        className="fixed inset-0 z-0 opacity-20 bg-cover bg-center bg-no-repeat mix-blend-screen pointer-events-none"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/hero-bg.png)` }}
      />
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/15 blur-[120px] rounded-full pointer-events-none" />

      <AnimatePresence>
        {clipboardToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-card border border-primary/30 shadow-xl text-sm text-primary font-medium"
          >
            <Check className="w-4 h-4" /> YouTube URL pasted from clipboard
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 w-full max-w-3xl flex flex-col items-center mb-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-center text-center space-y-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
            <SparkleIcon className="w-4 h-4 text-secondary" />
            <span className="text-sm font-medium tracking-wide text-zinc-300">Suno.ai Prompt Generator</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-white via-zinc-200 to-zinc-500 drop-shadow-sm pb-2">
            Track to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              Template
            </span>
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 max-w-xl font-medium leading-relaxed">
            Paste any YouTube song link. Our AI will extract its soul and construct the perfect Suno prompt for you to remix, recreate, or be inspired.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className="w-full mt-10 space-y-4"
        >
          {/* Mode toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium mr-1">Mode:</span>
            {(["cover", "inspired"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode((prev) => prev === m ? null : m)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  mode === m
                    ? m === "cover"
                      ? "bg-secondary/20 border-secondary/50 text-secondary"
                      : "bg-primary/20 border-primary/50 text-primary"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
                )}
              >
                {m === "cover" ? <><Layers className="w-3 h-3" /> AI Cover</> : <><Wand2 className="w-3 h-3" /> Inspired By</>}
              </button>
            ))}
            {mode && (
              <span className="text-xs text-zinc-500 italic">
                {mode === "cover" ? "— faithful reconstruction" : "— creative reimagining"}
              </span>
            )}
          </div>

          {/* URL input row */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col sm:flex-row gap-3 relative">
            <div className="relative flex-1 group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-2xl blur-md opacity-20 group-focus-within:opacity-50 transition-opacity duration-500" />
              <div className="relative flex items-center bg-card border-2 border-border focus-within:border-primary/50 rounded-2xl overflow-hidden transition-all shadow-xl">
                <div className="pl-5 pr-3 text-muted-foreground">
                  <Youtube className="w-6 h-6" />
                </div>
                <input
                  {...form.register("youtubeUrl")}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full py-4 pr-5 bg-transparent border-none text-foreground placeholder:text-zinc-600 focus:outline-none focus:ring-0 text-lg font-medium"
                  autoComplete="off"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSurpriseMe}
                title="Surprise Me — randomise all settings"
                className="shrink-0 px-4 py-4 sm:py-0 rounded-2xl font-bold text-zinc-300 border border-border bg-white/5 hover:bg-white/10 hover:text-white transition-all flex items-center gap-2"
              >
                <Shuffle className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">Surprise</span>
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="relative shrink-0 px-8 py-4 sm:py-0 rounded-2xl font-bold text-white shadow-xl flex items-center justify-center gap-2 group overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary group-hover:scale-105 transition-transform duration-300" />
                <span className="relative z-10 flex items-center gap-2 text-lg">
                  {isLoading ? "Analyzing..." : "Generate"}
                  {!isLoading && <Wand2 className="w-5 h-5 group-hover:rotate-12 transition-transform" />}
                </span>
              </button>
            </div>
          </form>

          {/* Video preview card */}
          <AnimatePresence>
            {videoPreview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/4 border border-border/60">
                  {videoPreview.thumbnail && (
                    <img
                      src={videoPreview.thumbnail}
                      alt="thumbnail"
                      className="w-20 h-14 object-cover rounded-lg shrink-0 bg-zinc-800"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {previewLoading && !videoPreview.title ? (
                      <div className="space-y-1.5">
                        <div className="h-3.5 bg-white/10 rounded animate-pulse w-3/4" />
                        <div className="h-3 bg-white/5 rounded animate-pulse w-1/2" />
                      </div>
                    ) : videoPreview.title ? (
                      <>
                        <p className="font-semibold text-sm text-foreground truncate">{videoPreview.title}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{videoPreview.author}{videoPreview.duration ? ` · ${videoPreview.duration}` : ""}</p>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-500">YouTube video detected</p>
                    )}
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" title="Video found" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {form.formState.errors.youtubeUrl && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="text-destructive font-medium flex items-center gap-2 pl-2"
            >
              <AlertCircle className="w-4 h-4" />
              {form.formState.errors.youtubeUrl.message}
            </motion.p>
          )}

          {apiError && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="text-destructive font-medium flex items-center gap-2 pl-2 bg-destructive/10 p-3 rounded-lg border border-destructive/20"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              {apiError}
            </motion.p>
          )}

          {/* Expand toggles */}
          <div className="flex flex-wrap gap-2 pt-1">
            <ExpandToggle
              active={showStyleControls}
              onClick={() => setShowStyleControls((v) => !v)}
              icon={<Zap className="w-3.5 h-3.5" />}
              label="Style Controls"
              activeCount={styleActiveCount}
            />
            <ExpandToggle
              active={showNegBuilder}
              onClick={() => setShowNegBuilder((v) => !v)}
              icon={<Ban className="w-3.5 h-3.5" />}
              label="Exclusions"
              activeCount={negActiveCount}
            />
            <ExpandToggle
              active={showManualLyrics}
              onClick={() => setShowManualLyrics((v) => !v)}
              icon={<FileText className="w-3.5 h-3.5" />}
              label="Override Lyrics"
              activeCount={manualLyrics.trim().length > 0 ? 1 : 0}
            />
            {history.length > 0 && (
              <ExpandToggle
                active={showHistory}
                onClick={() => setShowHistory((v) => !v)}
                icon={<History className="w-3.5 h-3.5" />}
                label={`History (${history.length})`}
                activeCount={0}
              />
            )}
          </div>

          {/* Style Controls Panel */}
          <AnimatePresence>
            {showStyleControls && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="bg-card/40 backdrop-blur-md border border-border rounded-2xl p-5 space-y-5">
                  <p className="text-xs text-zinc-500 font-medium tracking-wide uppercase">
                    Style preferences — these guide the AI output
                  </p>

                  {/* Vocal gender */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                      <Mic2 className="w-4 h-4 text-secondary" /> Vocal Gender
                    </label>
                    <div className="flex gap-2">
                      {(["auto", "male", "female"] as const).map((v) => (
                        <ChipButton key={v} active={vocalGender === v} onClick={() => setVocalGender(v)}>
                          {v === "auto" ? "Auto" : v.charAt(0).toUpperCase() + v.slice(1)}
                        </ChipButton>
                      ))}
                    </div>
                  </div>

                  {/* Energy level */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                      <Zap className="w-4 h-4 text-secondary" /> Energy Level
                    </label>
                    <div className="flex gap-2">
                      {(["auto", "chill", "medium", "high"] as const).map((v) => (
                        <ChipButton key={v} active={energyLevel === v} onClick={() => setEnergyLevel(v)}>
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </ChipButton>
                      ))}
                    </div>
                  </div>

                  {/* Tempo / BPM */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                      <Gauge className="w-4 h-4 text-secondary" /> Tempo / BPM
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(["slow", "mid", "uptempo", "fast"] as const).map((v) => {
                        const label = { slow: "Slow (<80)", mid: "Mid (80–110)", uptempo: "Up-tempo (110–130)", fast: "Fast (130+)" }[v];
                        return (
                          <ChipButton key={v} active={tempo === v} onClick={() => setTempo((prev) => prev === v ? null : v)}>
                            {label}
                          </ChipButton>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mood / Vibe */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                      <Smile className="w-4 h-4 text-secondary" /> Mood / Vibe
                      <span className="text-xs text-zinc-500 font-normal">(up to {MAX_MOODS})</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {MOOD_TAGS.map((mood) => {
                        const isSelected = selectedMoods.includes(mood);
                        const isDisabled = !isSelected && selectedMoods.length >= MAX_MOODS;
                        return (
                          <button
                            key={mood}
                            type="button"
                            onClick={() => !isDisabled && setSelectedMoods((p) => toggleSet(p, mood, MAX_MOODS))}
                            className={cn(
                              "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                              isSelected ? "bg-secondary/20 text-secondary border-secondary/40"
                                : isDisabled ? "opacity-30 cursor-not-allowed bg-white/5 border-white/5 text-zinc-500"
                                : "bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
                            )}
                          >
                            {mood}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Instruments */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                      <Piano className="w-4 h-4 text-secondary" /> Instrument Focus
                      <span className="text-xs text-zinc-500 font-normal">(up to {MAX_INSTRUMENTS})</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {INSTRUMENT_TAGS.map((inst) => {
                        const isSelected = selectedInstruments.includes(inst);
                        const isDisabled = !isSelected && selectedInstruments.length >= MAX_INSTRUMENTS;
                        return (
                          <button
                            key={inst}
                            type="button"
                            onClick={() => !isDisabled && setSelectedInstruments((p) => toggleSet(p, inst, MAX_INSTRUMENTS))}
                            className={cn(
                              "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                              isSelected ? "bg-primary/20 text-primary border-primary/40"
                                : isDisabled ? "opacity-30 cursor-not-allowed bg-white/5 border-white/5 text-zinc-500"
                                : "bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
                            )}
                          >
                            {inst}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Era */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                      <Clock className="w-4 h-4 text-secondary" /> Era / Decade
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(["auto", "70s", "80s", "90s", "2000s", "modern"] as const).map((v) => (
                        <ChipButton key={v} active={era === v} onClick={() => setEra(v)}>
                          {v === "auto" ? "Auto" : v}
                        </ChipButton>
                      ))}
                    </div>
                  </div>

                  {/* Genre Picker */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                        <Tags className="w-4 h-4 text-secondary" /> Genres
                        <span className="text-xs text-zinc-500 font-normal">(up to {MAX_GENRES})</span>
                      </label>
                      {selectedGenres.length > 0 && (
                        <button type="button" onClick={() => setSelectedGenres([])} className="text-xs text-zinc-500 hover:text-destructive transition-colors">Clear all</button>
                      )}
                    </div>
                    {selectedGenres.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-primary/5 border border-primary/20">
                        {selectedGenres.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setSelectedGenres((p) => p.filter((x) => x !== g))}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30 hover:bg-destructive/20 hover:text-destructive hover:border-destructive/30 transition-colors"
                          >
                            {g}<span className="text-[10px] leading-none">✕</span>
                          </button>
                        ))}
                        <span className="flex items-center text-[10px] text-zinc-500 ml-1">{selectedGenres.length}/{MAX_GENRES}</span>
                      </div>
                    )}
                    <div className="space-y-2">
                      {GENRE_CATEGORIES.map((cat) => {
                        const isExpanded = expandedGenreCategory === cat.label;
                        const displayedGenres = isExpanded ? cat.genres : cat.genres.slice(0, 6);
                        const hasMore = cat.genres.length > 6;
                        const catSelected = cat.genres.filter((g) => selectedGenres.includes(g)).length;
                        return (
                          <div key={cat.label} className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{cat.label}</span>
                              {catSelected > 0 && <span className="text-[10px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5">{catSelected}</span>}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {displayedGenres.map((genre) => {
                                const isSelected = selectedGenres.includes(genre);
                                const isDisabled = !isSelected && selectedGenres.length >= MAX_GENRES;
                                return (
                                  <button
                                    key={genre}
                                    type="button"
                                    onClick={() => !isDisabled && setSelectedGenres((p) => toggleSet(p, genre, MAX_GENRES))}
                                    className={cn(
                                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                                      isSelected ? "bg-primary/20 text-primary border-primary/40"
                                        : isDisabled ? "bg-background/20 text-zinc-600 border-border/30 cursor-not-allowed opacity-40"
                                        : "bg-background/40 text-zinc-400 border-border/50 hover:border-primary/40 hover:text-zinc-200 hover:bg-primary/10"
                                    )}
                                  >
                                    {genre}
                                  </button>
                                );
                              })}
                              {hasMore && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedGenreCategory(isExpanded ? null : cat.label)}
                                  className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-border/40 text-zinc-500 hover:text-zinc-300 hover:border-border transition-colors"
                                >
                                  {isExpanded ? "Show less" : `+${cat.genres.length - 6} more`}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Genre nudge */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                      <Music2 className="w-4 h-4 text-secondary" /> Genre Nudge
                      <span className="text-xs text-zinc-500 font-normal">(free text)</span>
                    </label>
                    <input
                      value={genreNudge}
                      onChange={(e) => setGenreNudge(e.target.value)}
                      placeholder='e.g. "more trap", "jazz influence", "synthwave"'
                      className="w-full px-4 py-2.5 rounded-xl bg-background/50 border border-border text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Negative Prompt Builder */}
          <AnimatePresence>
            {showNegBuilder && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="bg-card/40 backdrop-blur-md border border-border rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500 font-medium tracking-wide uppercase">
                      Negative Prompt Builder — tell Suno what to avoid
                    </p>
                    {excludeTags.length > 0 && (
                      <button type="button" onClick={() => setExcludeTags([])} className="text-xs text-zinc-500 hover:text-destructive transition-colors">Clear all</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {NEGATIVE_PRESETS.map((preset) => {
                      const tags = preset.value.split(",");
                      const isChecked = tags.some((t) => excludeTags.includes(t));
                      return (
                        <label
                          key={preset.value}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm",
                            isChecked
                              ? "bg-destructive/10 border-destructive/30 text-destructive"
                              : "bg-white/4 border-border/40 text-zinc-400 hover:border-border hover:text-zinc-200"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={isChecked}
                            onChange={() => {
                              setExcludeTags((prev) => {
                                if (isChecked) return prev.filter((t) => !tags.includes(t));
                                return [...new Set([...prev, ...tags])];
                              });
                            }}
                          />
                          <span className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                            isChecked ? "bg-destructive/30 border-destructive/50" : "border-border"
                          )}>
                            {isChecked && <Check className="w-2.5 h-2.5" />}
                          </span>
                          {preset.label}
                        </label>
                      );
                    })}
                  </div>
                  {excludeTags.length > 0 && (
                    <div className="text-xs text-zinc-500 font-mono bg-background/40 rounded-lg px-3 py-2 border border-border/40">
                      Will add to negative prompt: <span className="text-zinc-300">{excludeTags.join(",")}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Manual Lyrics Panel */}
          <AnimatePresence>
            {showManualLyrics && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="bg-card/40 backdrop-blur-md border border-border rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500 font-medium tracking-wide uppercase">
                      Paste your own lyrics — overrides the automatic lookup
                    </p>
                    {manualLyrics.trim().length > 0 && (
                      <span className="text-xs text-secondary font-mono">{manualLyrics.trim().length} chars</span>
                    )}
                  </div>
                  <textarea
                    value={manualLyrics}
                    onChange={(e) => setManualLyrics(e.target.value)}
                    placeholder={"Paste song lyrics here...\n\nThese will be used verbatim in the Suno template instead of the automatically fetched lyrics."}
                    rows={8}
                    className="w-full px-4 py-3 rounded-xl bg-background/50 border border-border text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-colors resize-y font-mono leading-relaxed"
                  />
                  {manualLyrics.trim().length > 0 && (
                    <button type="button" onClick={() => setManualLyrics("")} className="text-xs text-zinc-500 hover:text-destructive transition-colors">
                      Clear lyrics
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* History Panel */}
          <AnimatePresence>
            {showHistory && history.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="bg-card/40 backdrop-blur-md border border-border rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500 font-medium tracking-wide uppercase">Recent generations</p>
                    <button type="button" onClick={handleClearHistory} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-destructive transition-colors">
                      <Trash2 className="w-3 h-3" /> Clear all
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                    {history.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleLoadHistory(entry)}
                        className="w-full text-left px-4 py-3 rounded-xl bg-background/40 hover:bg-background/70 border border-border/50 hover:border-primary/30 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">{entry.template.songTitle}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{entry.template.artist}</p>
                          </div>
                          <span className="text-xs text-zinc-600 shrink-0 mt-0.5">{formatRelativeTime(entry.timestamp)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Results Area */}
      <div className="w-full relative z-10 flex-1 flex flex-col justify-start">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="w-full flex justify-center py-12"
            >
              <LoadingEq />
            </motion.div>
          ) : isGeneratingVariations ? (
            <motion.div
              key="var-loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center py-12 gap-4"
            >
              <LoadingEq />
              <p className="text-sm text-zinc-500">Generating 2 variations in parallel…</p>
            </motion.div>
          ) : showVariations && (variationA || variationB) ? (
            <motion.div
              key="variations"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-6xl mx-auto"
            >
              <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="text-lg font-bold text-foreground">Compare Variations</h2>
                <button
                  type="button"
                  onClick={() => setShowVariations(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  ✕ Close
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {[{ v: "A" as const, tmpl: variationA }, { v: "B" as const, tmpl: variationB }].map(({ v, tmpl }) => (
                  <div key={v} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-zinc-300">Variation {v}</span>
                      {tmpl && (
                        <button
                          type="button"
                          onClick={() => handleUseVariation(v)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-colors"
                        >
                          <Check className="w-3 h-3" /> Use this one
                        </button>
                      )}
                    </div>
                    {tmpl ? (
                      <TemplateResult
                        template={tmpl}
                        regeneratingSection={null}
                        onRegenerateSection={() => {}}
                        compact
                      />
                    ) : (
                      <div className="flex items-center justify-center h-40 rounded-2xl border border-border bg-card/40">
                        <LoadingEq />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          ) : currentTemplate ? (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Action bar above results */}
              <div className="flex flex-wrap gap-2 mb-4 max-w-6xl mx-auto px-1">
                <button
                  type="button"
                  onClick={handleGenerateVariations}
                  disabled={isGeneratingVariations}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                >
                  <Layers className="w-3.5 h-3.5" /> Generate 2 Variations
                </button>
                <button
                  type="button"
                  onClick={handleShareTemplate}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all",
                    shareToast === "copied"
                      ? "bg-green-500/20 border-green-500/40 text-green-400"
                      : "bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {shareToast === "copied" ? <><Check className="w-3.5 h-3.5" /> Link copied!</> : <><Share2 className="w-3.5 h-3.5" /> Share template</>}
                </button>
              </div>
              <TemplateResult
                template={currentTemplate}
                regeneratingSection={regeneratingSection}
                onRegenerateSection={handleRegenerateSection}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ExpandToggle({
  active, onClick, icon, label, activeCount,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeCount: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
        active
          ? "bg-primary/20 border-primary/40 text-primary"
          : "bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
      )}
    >
      {icon}
      {label}
      {activeCount > 0 && (
        <span className="ml-1 w-4 h-4 rounded-full bg-secondary/80 text-black text-[10px] font-bold flex items-center justify-center">
          {activeCount}
        </span>
      )}
      <ChevronDown className={cn("w-3.5 h-3.5 ml-0.5 transition-transform duration-200", active && "rotate-180")} />
    </button>
  );
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-lg text-sm font-medium border transition-all",
        active
          ? "bg-primary/20 border-primary/50 text-primary shadow-sm shadow-primary/10"
          : "bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
      )}
    >
      {children}
    </button>
  );
}

function SparkleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
    </svg>
  );
}
