import { useState, useEffect, useRef, useCallback } from "react";
import logoTrackTemplate from "@assets/logotracktemplateBilde-sharpen-denoise-text-lighting-remove-u_1774346189019.jpeg";
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
  Music,
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
  Star,
  BrainCircuit,
  Sparkles,
  X,
  BarChart2,
  GitMerge,
  ListMusic,
  Network,
} from "lucide-react";
import { useGenerateSunoTemplate } from "@workspace/api-client-react";
import type { SunoTemplate } from "@workspace/api-client-react";
import { VariationWorkshop } from "@/components/VariationWorkshop";
import { TemplateResult } from "@/components/TemplateResult";
import { LoadingEq } from "@/components/LoadingEq";
import { ExampleGallery } from "@/components/ExampleGallery";
import { MoodBoard } from "@/components/MoodBoard";
import { BatchMode } from "@/components/BatchMode";
import { MultiTrackBuilder } from "@/components/MultiTrackBuilder";
import { TransitionBuilder } from "@/components/TransitionBuilder";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { ReverseMode } from "@/components/ReverseMode";
import { GenreGenomeMap } from "@/components/GenreGenomeMap";
import type { MoodSettingsResponse } from "@/lib/manual-api";
import { cn } from "@/lib/utils";

const HISTORY_KEY = "suno-template-history";
const MAX_HISTORY = 10;
const MAX_GENRES = 5;
const MAX_MOODS = 4;
const MAX_INSTRUMENTS = 5;

const MOOD_TAGS = [
  "Dark", "Euphoric", "Nostalgic", "Melancholic", "Aggressive", "Romantic",
  "Dreamy", "Rebellious", "Playful", "Mysterious", "Cinematic", "Hopeful",
  "Angry", "Tender", "Haunted", "Triumphant", "Vulnerable", "Defiant",
  "Serene", "Intense", "Wistful", "Bittersweet", "Groovy", "Frantic",
  "Ethereal", "Hypnotic", "Brooding", "Raw", "Gritty", "Majestic",
  "Eerie", "Sensual", "Savage", "Soulful", "Cathartic", "Blissful",
  "Chaotic", "Anxious", "Desolate", "Primal", "Lush", "Fierce",
  "Longing", "Psychedelic", "Icy", "Dusty", "Tense", "Laid-back",
  "Transcendent", "Unsettling", "Festive", "Murky", "Euphoric-Sad",
  "Punchy", "Stormy", "Intimate", "Epic", "Uneasy", "Crystalline",
];
const INSTRUMENT_TAGS = [
  "Piano", "Guitar", "Synth", "Strings", "Bass", "Choir", "Brass", "Drums",
  "Violin", "Flute", "Organ", "Sitar", "Cello", "Saxophone", "Trumpet",
  "Harp", "Banjo", "Ukulele", "Mandolin", "Marimba", "Theremin", "Mellotron",
  "Pedal Steel", "Dulcimer",
  "808", "Acoustic Guitar", "Electric Guitar", "Harmonica", "Accordion",
  "Vibraphone", "Glockenspiel", "Rhodes", "Clarinet", "Oboe", "French Horn",
  "Tabla", "Congas", "Sub Bass", "Pad", "Wurlitzer", "Harpsichord",
  "Bagpipes", "Moog", "Oud", "Koto", "Erhu", "Steel Drums",
  "Trombone", "Bassoon", "Bansuri", "Lap Steel", "Didgeridoo",
];
const QUALITY_EXCLUSIONS: { label: string; value: string }[] = [
  { label: "Muddy mix", value: "muddy mix" },
  { label: "Soulless", value: "soulless" },
  { label: "Amateur", value: "amateur" },
  { label: "Generic EDM", value: "generic edm" },
  { label: "Happy pop", value: "happy pop" },
  { label: "Uncreative", value: "uncreative" },
  { label: "Boring", value: "boring" },
  { label: "Stale", value: "stale" },
  { label: "Weak beats", value: "weak beats" },
  { label: "Predictable", value: "predictable" },
  { label: "Cheesy", value: "cheezy" },
  { label: "Silence gaps", value: "silence" },
  { label: "Thin sound", value: "thin sound" },
  { label: "Over-compressed", value: "over-compressed" },
  { label: "Flat dynamics", value: "flat dynamics" },
  { label: "Dated sound", value: "dated production" },
];

const ELEMENT_EXCLUSIONS: { label: string; value: string }[] = [
  { label: "Rap", value: "no rap" },
  { label: "Autotune", value: "no autotune" },
  { label: "Distortion", value: "no heavy distortion" },
  { label: "Choir", value: "no choir" },
  { label: "Orchestral", value: "no orchestral" },
  { label: "8-bit / Chiptune", value: "no 8-bit,no chiptune" },
  { label: "Drums", value: "no drums" },
  { label: "Piano", value: "no piano" },
  { label: "Synth", value: "no synthesizer" },
  { label: "EDM drops", value: "no EDM,no club beat" },
  { label: "Strings", value: "no violin,no strings" },
  { label: "Brass", value: "no brass,no horns" },
  { label: "Trap beats", value: "no trap beats,no trap hi-hats" },
  { label: "Falsetto", value: "no falsetto" },
  { label: "Spoken word", value: "no spoken word" },
  { label: "Lo-fi", value: "no lo-fi,no vinyl crackle" },
  { label: "Heavy reverb", value: "no heavy reverb" },
  { label: "Country", value: "no country" },
  { label: "Guitar", value: "no guitar" },
  { label: "Guitar solo", value: "no guitar solo" },
  { label: "Screaming", value: "no screaming,no harsh vocals" },
  { label: "Bass drop", value: "no bass drop,no sub bass" },
  { label: "Long intro", value: "no long intro" },
  { label: "Samples", value: "no samples,no sampling" },
  { label: "Whistling", value: "no whistling" },
  { label: "Crowd noise", value: "no crowd noise" },
  { label: "Clapping", value: "no clapping" },
  { label: "Saxophone", value: "no saxophone" },
  { label: "Metal", value: "no metal" },
  { label: "Hip-hop beats", value: "no hip-hop beats" },
  { label: "Pitch shifting", value: "no pitch shifting" },
  { label: "Breakdowns", value: "no breakdown" },
  { label: "Voice FX", value: "no vocoder,no voice effects" },
  { label: "Glitch FX", value: "no glitch,no glitch effects" },
  { label: "Acoustic guitar", value: "no acoustic guitar" },
  { label: "Flute", value: "no flute" },
  { label: "Bass guitar", value: "no bass guitar" },
  { label: "Jazz harmony", value: "no jazz chords" },
];

interface GenreCategory {
  label: string;
  genres: string[];
}

const GENRE_CATEGORIES: GenreCategory[] = [
  { label: "Pop", genres: ["Pop", "Dance Pop", "Indie Pop", "Electropop", "Synth-Pop", "Dream Pop", "Chamber Pop", "Baroque Pop", "Britpop", "Power Pop", "Teen Pop", "Art Pop", "Bedroom Pop", "Chillout Pop"] },
  { label: "Rock", genres: ["Rock", "Alternative Rock", "Indie Rock", "Hard Rock", "Classic Rock", "Punk", "Post-Punk", "Grunge", "Shoegaze", "Psychedelic Rock", "Progressive Rock", "Garage Rock", "Folk Rock", "Blues-Rock", "Arena Rock", "New Wave", "Emo", "Post-Rock", "Stoner Rock"] },
  { label: "House", genres: ["House", "Deep House", "Tech House", "Progressive House", "Acid House", "Melodic House", "Afro House", "Soulful House", "Chicago House", "Tribal House", "Jackin House", "Micro House", "Nu Disco", "Lo-Fi House", "Garage House", "Funky House"] },
  { label: "Techno", genres: ["Techno", "Berlin Techno", "Detroit Techno", "Minimal Techno", "Hard Techno", "Industrial Techno", "Dub Techno", "Acid Techno", "Hypnotic Techno", "Dark Techno", "Modular Techno", "Rave Techno", "Ambient Techno", "Afro Techno"] },
  { label: "Trance", genres: ["Trance", "Progressive Trance", "Uplifting Trance", "Psytrance", "Goa Trance", "Tech Trance", "Vocal Trance", "Future Rave", "Dark Psy", "Forest Psy", "Full-On Psy", "Big Room Trance", "Twilight Psy", "Orchestral Trance"] },
  { label: "Drum & Bass / Jungle", genres: ["Drum & Bass", "Liquid DnB", "Neurofunk", "Darkstep", "Jump Up", "Jungle", "Techstep", "Rollers", "Drumstep", "Minimal DnB", "Atmospheric DnB", "Reese Bass DnB", "Halfstep DnB", "Afro DnB"] },
  { label: "Dubstep & Bass", genres: ["Dubstep", "Post-Dubstep", "Brostep", "Riddim", "Tearout", "Halfstep", "Deep Dubstep", "Wonky", "Deathstep", "Minatory", "Future Bass", "Wave", "Melodic Bass", "Color Bass"] },
  { label: "Breakbeat", genres: ["Breakbeat", "Big Beat", "Chemical Breaks", "Progressive Breaks", "Nu-Skool Breaks", "Electro Break", "Glitch Hop", "Amen Break", "Ragga Breaks", "Miami Bass", "Broken Beat"] },
  { label: "Synthwave & Retro", genres: ["Synthwave", "Darksynth", "Outrun", "Retrowave", "Chillwave", "Hi-NRG", "Italo Disco", "Futurepop", "Cyberwave", "Nu-Italo", "Dreamwave", "Spacesynth", "Elektro", "New Romanticism"] },
  { label: "Electro & EBM", genres: ["Electro", "EBM", "Aggrotech", "Dark Electro", "Industrial", "New Beat", "Electro-Industrial", "Darkwave", "Cold Wave", "Power Noise", "Noise", "Post-Industrial", "Martial Industrial", "Hellectro"] },
  { label: "EDM & Big Room", genres: ["EDM", "Big Room", "Electro House", "Festival Trap", "Complextro", "Dutch House", "Bounce", "Hands Up", "Club House", "Mainstage", "Hardstyle EDM", "Rave Anthem", "Carnival Electro"] },
  { label: "Ambient & IDM", genres: ["Ambient", "Dark Ambient", "IDM", "Glitch", "Space Music", "Drone Ambient", "Isolationism", "Microsound", "Clicks & Cuts", "Generative", "Field Recording", "Bio-Ambient", "Post-Glitch", "Algo-Glitch", "New Age"] },
  { label: "Trip-Hop & Downtempo", genres: ["Trip-Hop", "Downtempo", "Chillhop", "Lo-Fi", "Bristol Sound", "Nu Jazz", "Dub Ambient", "Cinematic Downtempo", "Chillout", "Electronica", "Neo-Electro", "Space Hop"] },
  { label: "Vaporwave & Future Funk", genres: ["Vaporwave", "Future Funk", "Dreampunk", "Mallsoft", "City Pop Revival", "Vaportrap", "Hardvapour", "Slushwave", "Hypersynth", "Future Nostalgia", "Lo-Fi Aesthetics", "Utopian Virtual"] },
  { label: "Hardcore & Hard Dance", genres: ["Hardcore", "Gabber", "Hardstyle", "Frenchcore", "Happy Hardcore", "UK Hardcore", "Speedcore", "Rawstyle", "Industrial Hardcore", "Terror", "Uptempo Hardcore", "Makina", "Schranz", "Hard Trance"] },
  { label: "UK Garage & Grime", genres: ["Grime", "UK Garage", "2-Step", "Bassline", "UK Bass", "Hyper-Garage", "Drill Garage", "Speed Garage", "Soulful 2-Step", "Funky House UK", "Jersey Club", "Juke"] },
  { label: "Phonk & Hyperpop", genres: ["Phonk", "Memphis Phonk", "Slavic Phonk", "Drift Phonk", "Dark Phonk", "Hyperpop", "PC Music", "Bubblegum Bass", "Digicore", "Pluggnb", "Emo Rap Phonk", "Rage"] },
  { label: "Afro Electronic", genres: ["Amapiano", "Gqom", "Afro House", "Afro Tech", "Baile Funk", "Kuduro", "Footwork", "Kwaito", "Shangaan Electro", "Afrobeat Electronic", "Afro Percussion", "Global Bass"] },
  { label: "Hip-Hop", genres: ["Hip-Hop", "Trap", "Rap", "Drill", "Boom Bap", "Gangsta Rap", "G-Funk", "Conscious Hip-Hop", "Lo-Fi Hip-Hop", "Grime", "Cloud Rap", "East Coast", "West Coast Rap", "Golden Age Hip Hop", "Jazz Rap", "Phonk"] },
  { label: "R&B / Soul", genres: ["R&B", "Soul", "Neo-Soul", "Funk", "Disco", "Motown", "Gospel", "Contemporary R&B", "Quiet Storm", "Psychedelic Soul", "New Jack Swing"] },
  { label: "Jazz", genres: ["Jazz", "Smooth Jazz", "Bebop", "Swing", "Jazz Fusion", "Big Band", "Acid Jazz", "Cool Jazz", "Modal Jazz", "Latin Jazz", "Free Jazz", "Nu Jazz"] },
  { label: "Metal", genres: ["Metal", "Heavy Metal", "Black Metal", "Death Metal", "Thrash Metal", "Nu Metal", "Metalcore", "Power Metal", "Doom Metal", "Symphonic Metal", "Groove Metal", "Djent", "Deathcore", "Progressive Metal", "Folk Metal"] },
  { label: "Country / Folk", genres: ["Country", "Americana", "Bluegrass", "Folk", "Indie Folk", "Outlaw Country", "Country Rock", "Country Pop", "Contemporary Folk", "Alt-Country", "Honky Tonk", "Western Swing"] },
  { label: "Classical", genres: ["Classical", "Orchestral", "Baroque", "Cinematic", "Film Score", "Chamber Music", "Opera", "Neo-Classical", "Minimalist", "Romantic"] },
  { label: "World / Other", genres: ["K-Pop", "Afrobeats", "Reggae", "Dancehall", "Reggaeton", "Latin Pop", "Bossa Nova", "Flamenco", "Salsa", "Cumbia", "Afropop", "Afro-Cuban", "J-Pop", "Tropical", "Ska", "Dub"] },
  { label: "Blues", genres: ["Blues", "Delta Blues", "Chicago Blues", "Electric Blues", "Soul Blues", "Blues Rock", "Jump Blues", "Swamp Blues"] },
];

const ALL_GENRES = GENRE_CATEGORIES.flatMap((c) => c.genres);
const ALL_ERAS = ["50s", "60s", "70s", "80s", "90s", "2000s", "2010s", "modern"] as const;

interface CreativePreset {
  id: string;
  label: string;
  emoji: string;
  description: string;
  settings: {
    mode?: "cover" | "inspired";
    energyLevel?: "auto" | "very chill" | "chill" | "medium" | "high" | "intense";
    tempo?: "ballad" | "slow" | "mid" | "groove" | "uptempo" | "fast" | "hyper" | null;
    selectedMoods?: string[];
    selectedInstruments?: string[];
    genreNudge?: string;
    excludeTags?: string[];
  };
}

const CREATIVE_PRESETS: CreativePreset[] = [
  {
    id: "faithful-cover",
    label: "Faithful Cover",
    emoji: "🎯",
    description: "Recreate the original as closely as possible",
    settings: { mode: "cover", energyLevel: "auto", genreNudge: "" },
  },
  {
    id: "lofi-study",
    label: "Lo-Fi Study",
    emoji: "📚",
    description: "Chill tape-warped lo-fi version",
    settings: { mode: "inspired", energyLevel: "chill", tempo: "slow", selectedMoods: ["Nostalgic", "Dreamy"], selectedInstruments: ["Piano", "Guitar"], genreNudge: "lo-fi hip-hop, vinyl crackle, tape saturation, bedroom recording" },
  },
  {
    id: "epic-orchestral",
    label: "Epic Orchestral",
    emoji: "🎻",
    description: "Grand cinematic orchestral reimagining",
    settings: { mode: "inspired", energyLevel: "intense", selectedMoods: ["Cinematic", "Triumphant"], selectedInstruments: ["Strings", "Brass", "Choir"], genreNudge: "epic orchestral, Hans Zimmer-style, cinematic score, sweeping strings" },
  },
  {
    id: "festival-edm",
    label: "Festival EDM",
    emoji: "⚡",
    description: "High-energy electronic festival version",
    settings: { mode: "inspired", energyLevel: "intense", tempo: "fast", selectedMoods: ["Euphoric"], genreNudge: "progressive house, festival EDM, big room, massive drop, stadium anthem" },
  },
  {
    id: "dark-brooding",
    label: "Dark & Brooding",
    emoji: "🌑",
    description: "Dark atmospheric cinematic reimagining",
    settings: { mode: "inspired", energyLevel: "medium", tempo: "slow", selectedMoods: ["Dark", "Mysterious", "Haunted"], genreNudge: "dark ambient, post-punk, cold wave, film noir, brooding atmosphere" },
  },
  {
    id: "jazz-lounge",
    label: "Jazz Lounge",
    emoji: "🎷",
    description: "Smooth late-night jazz reimagining",
    settings: { mode: "inspired", energyLevel: "chill", tempo: "groove", selectedMoods: ["Romantic", "Nostalgic"], selectedInstruments: ["Piano", "Saxophone", "Bass"], genreNudge: "jazz lounge, bossa nova, late-night smoky bar, brushed drums" },
  },
];

const ARTIST_STYLES_KEY = "suno-artist-styles";

interface ArtistStyle {
  genres?: string[];
  era?: string;
  energy?: string;
  tempo?: string;
  moods?: string[];
  instruments?: string[];
}

function loadArtistStyles(): Record<string, ArtistStyle> {
  try {
    const raw = localStorage.getItem(ARTIST_STYLES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ArtistStyle>) : {};
  } catch { return {}; }
}

function saveArtistStyle(artist: string, style: ArtistStyle) {
  try {
    const all = loadArtistStyles();
    const key = artist.toLowerCase().trim();
    all[key] = style;
    const keys = Object.keys(all);
    if (keys.length > 50) delete all[keys[0]];
    localStorage.setItem(ARTIST_STYLES_KEY, JSON.stringify(all));
  } catch {}
}

function getArtistStyle(artist: string): ArtistStyle | null {
  try {
    const all = loadArtistStyles();
    return all[artist.toLowerCase().trim()] ?? null;
  } catch { return null; }
}
const ALL_ENERGIES = ["very chill", "chill", "medium", "high", "intense"] as const;
const ALL_TEMPOS = ["ballad", "slow", "mid", "groove", "uptempo", "fast", "hyper"] as const;
const ALL_VOCALS = ["male", "female", "mixed", "duet", "no vocals"] as const;

interface UsedOptions {
  genres?: string[];
  moods?: string[];
  instruments?: string[];
  vocalGender?: string;
  energyLevel?: string;
  era?: string;
  tempo?: string;
}

interface HistoryEntry {
  id: string;
  timestamp: number;
  youtubeUrl: string;
  template: SunoTemplate;
  rating?: number | null;
  usedOptions?: UsedOptions;
}

interface VideoPreview {
  title: string;
  author: string;
  thumbnail: string | null;
  duration: string | null;
}

interface SuggestedControls {
  genres: string[];
  era: string | null;
  energy: string | null;
  tempo: string | null;
  vocals: string | null;
  songTitle: string;
  artist: string;
  mbTags: string[];
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
  const varCMutation = useGenerateSunoTemplate();
  const varDMutation = useGenerateSunoTemplate();

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
  const [vocalGender, setVocalGender] = useState<"auto" | "male" | "female" | "mixed" | "duet" | "no vocals">("auto");
  const [energyLevel, setEnergyLevel] = useState<"auto" | "very chill" | "chill" | "medium" | "high" | "intense">("auto");
  const [era, setEra] = useState<"auto" | "50s" | "60s" | "70s" | "80s" | "90s" | "2000s" | "2010s" | "modern">("auto");
  const [genreNudge, setGenreNudge] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [expandedGenreCategory, setExpandedGenreCategory] = useState<string | null>(null);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);
  const [mode, setMode] = useState<"cover" | "inspired" | null>(null);
  const [tempo, setTempo] = useState<"ballad" | "slow" | "mid" | "groove" | "uptempo" | "fast" | "hyper" | null>(null);
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [customExclusions, setCustomExclusions] = useState("");
  const [isInstrumental, setIsInstrumental] = useState(false);

  const [videoPreview, setVideoPreview] = useState<VideoPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [variationA, setVariationA] = useState<SunoTemplate | null>(null);
  const [variationB, setVariationB] = useState<SunoTemplate | null>(null);
  const [variationC, setVariationC] = useState<SunoTemplate | null>(null);
  const [variationD, setVariationD] = useState<SunoTemplate | null>(null);
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const [selectedVariation, setSelectedVariation] = useState<"A" | "B" | null>(null);
  const [showVariations, setShowVariations] = useState(false);
  const [showVariationWorkshop, setShowVariationWorkshop] = useState(false);

  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [artistMemoryBanner, setArtistMemoryBanner] = useState<string | null>(null);

  // New panel visibility state
  const [showMoodBoard, setShowMoodBoard] = useState(false);
  const [showBatchMode, setShowBatchMode] = useState(false);
  const [showMultiTrack, setShowMultiTrack] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showReverseMode, setShowReverseMode] = useState(false);
  const [showGenreMap, setShowGenreMap] = useState(false);

  const [shareToast, setShareToast] = useState<"idle" | "copied">("idle");
  const [clipboardToast, setClipboardToast] = useState(false);
  const [templateRating, setTemplateRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [ratingSaved, setRatingSaved] = useState(false);
  const ratingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [suggestions, setSuggestions] = useState<SuggestedControls | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const lastUrlRef = useRef<string>("");
  const lastOptionsRef = useRef<object>({});
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const resp = await fetch(`/api/youtube-preview?url=${encodeURIComponent(url)}`);
      if (resp.ok) {
        const data = await resp.json() as VideoPreview & { cleanTitle?: string };
        setVideoPreview({ ...data, thumbnail: thumb });
        const artist = data.author ?? "";
        const title = data.cleanTitle ?? data.title ?? "";
        if (artist && title) {
          // Check per-artist memory first — show it as a "remembered" banner
          const saved = getArtistStyle(artist);
          if (saved && (saved.genres?.length || saved.era)) {
            if (saved.genres?.length) setSelectedGenres(saved.genres);
            if (saved.era) setEra(saved.era as typeof era);
            if (saved.energy) setEnergyLevel(saved.energy as typeof energyLevel);
            if (saved.tempo) setTempo(saved.tempo as typeof tempo);
            if (saved.moods?.length) setSelectedMoods(saved.moods);
            if (saved.instruments?.length) setSelectedInstruments(saved.instruments);
            setArtistMemoryBanner(artist);
            setShowStyleControls(true);
            setTimeout(() => setArtistMemoryBanner(null), 5000);
          }
          fetchSuggestionsForSong(title, artist);
        }
      }
    } catch {}
    setPreviewLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSuggestionsForSong = useCallback(async (title: string, artist: string) => {
    setSuggestLoading(true);
    setShowStyleControls(true);
    try {
      const params = new URLSearchParams({ title, artist });
      const resp = await fetch(`/api/suggest?${params.toString()}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) return;
      const data = await resp.json() as SuggestedControls;
      const hasAny = data.genres.length > 0 || data.era || data.energy || data.tempo;
      if (!hasAny) return;
      setSuggestions(data);
      if (data.genres.length > 0) setSelectedGenres(data.genres);
      if (data.era) setEra(data.era as typeof era);
      if (data.energy) setEnergyLevel(data.energy as typeof energyLevel);
      if (data.tempo) setTempo(data.tempo as typeof tempo);
    } catch {}
    finally {
      setSuggestLoading(false);
    }
  }, []);

  const urlValue = form.watch("youtubeUrl");
  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    const id = extractVideoId(urlValue ?? "");
    if (!id) {
      setVideoPreview(null);
      setSuggestions(null);
      setSuggestLoading(false);
      return;
    }
    setVideoPreview((prev) => prev ?? { title: "", author: "", thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`, duration: null });
    // Show loading state immediately
    setSuggestLoading(true);
    setShowStyleControls(true);
    previewTimerRef.current = setTimeout(() => fetchVideoPreview(urlValue), 800);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    };
  }, [urlValue, fetchVideoPreview]);

  const addToHistory = (url: string, template: SunoTemplate, opts?: UsedOptions) => {
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      youtubeUrl: url,
      template,
      rating: null,
      usedOptions: opts,
    };
    setHistory((prev) => {
      const next = [entry, ...prev.filter((e) => e.youtubeUrl !== url)].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  };

  const rateCurrentTemplate = (rating: number) => {
    const newRating = templateRating === rating ? null : rating;
    setTemplateRating(newRating);
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.map((e, i) =>
        i === 0
          ? { ...e, rating: newRating, usedOptions: e.usedOptions ?? extractUsedOptions() }
          : e
      );
      saveHistory(next);
      return next;
    });
    if (ratingTimerRef.current) clearTimeout(ratingTimerRef.current);
    setRatingSaved(true);
    ratingTimerRef.current = setTimeout(() => setRatingSaved(false), 2000);
  };

  const extractUsedOptions = (): UsedOptions => ({
    genres: selectedGenres.length > 0 ? selectedGenres : undefined,
    moods: selectedMoods.length > 0 ? selectedMoods : undefined,
    instruments: selectedInstruments.length > 0 ? selectedInstruments : undefined,
    vocalGender: vocalGender !== "auto" ? vocalGender : undefined,
    energyLevel: energyLevel !== "auto" ? energyLevel : undefined,
    era: era !== "auto" ? era : undefined,
    tempo: tempo ?? undefined,
  });

  const buildFeedbackContext = (): string | undefined => {
    const rated = history.filter((e) => typeof e.rating === "number");
    if (rated.length < 2) return undefined;

    const liked = rated.filter((e) => typeof e.rating === "number" && e.rating >= 4);
    const disliked = rated.filter((e) => typeof e.rating === "number" && e.rating <= 2);

    const countMap = <T extends string>(entries: HistoryEntry[], field: keyof UsedOptions): Map<T, number> => {
      const map = new Map<T, number>();
      entries.forEach((e) => {
        const vals = e.usedOptions?.[field] as T[] | undefined;
        vals?.forEach((v) => map.set(v, (map.get(v) ?? 0) + 1));
      });
      return map;
    };

    const topN = <T extends string>(map: Map<T, number>, n = 4): T[] =>
      [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

    const parts: string[] = [];

    if (liked.length > 0) {
      const g = topN(countMap<string>(liked, "genres"));
      const m = topN(countMap<string>(liked, "moods"));
      const inst = topN(countMap<string>(liked, "instruments"));
      const segments: string[] = [];
      if (g.length) segments.push(`genres: ${g.join(", ")}`);
      if (m.length) segments.push(`moods: ${m.join(", ")}`);
      if (inst.length) segments.push(`instruments: ${inst.join(", ")}`);
      if (segments.length) parts.push(`LIKED (lean toward these): ${segments.join("; ")}`);
    }

    if (disliked.length > 0) {
      const g = topN(countMap<string>(disliked, "genres"));
      const m = topN(countMap<string>(disliked, "moods"));
      const inst = topN(countMap<string>(disliked, "instruments"));
      const segments: string[] = [];
      if (g.length) segments.push(`genres: ${g.join(", ")}`);
      if (m.length) segments.push(`moods: ${m.join(", ")}`);
      if (inst.length) segments.push(`instruments: ${inst.join(", ")}`);
      if (segments.length) parts.push(`DISLIKED (avoid or deprioritise these): ${segments.join("; ")}`);
    }

    return parts.length > 0
      ? `User star ratings (1–5 scale; ≥4 = liked, ≤2 = disliked) from ${rated.length} past templates — ${parts.join(". ")}.`
      : undefined;
  };

  function toggleSet<T extends string>(prev: T[], value: T, max: number): T[] {
    if (prev.includes(value)) return prev.filter((v) => v !== value);
    if (prev.length >= max) return prev;
    return [...prev, value];
  }

  const buildOptions = () => {
    const allExcludeTags = [
      ...excludeTags,
      ...customExclusions.split(",").map((s) => s.trim()).filter(Boolean),
      ...(isInstrumental ? ["vocals", "singing", "spoken word"] : []),
    ];
    return {
      manualLyrics: manualLyrics.trim() || undefined,
      vocalGender: isInstrumental ? ("no vocals" as const) : (vocalGender !== "auto" ? vocalGender : undefined),
      energyLevel: energyLevel !== "auto" ? energyLevel : undefined,
      era: era !== "auto" ? era : undefined,
      genreNudge: genreNudge.trim() || undefined,
      genres: selectedGenres.length > 0 ? selectedGenres : undefined,
      moods: selectedMoods.length > 0 ? selectedMoods : undefined,
      instruments: selectedInstruments.length > 0 ? selectedInstruments : undefined,
      mode: mode ?? undefined,
      tempo: tempo ?? undefined,
      excludeTags: allExcludeTags.length > 0 ? allExcludeTags : undefined,
      isInstrumental: isInstrumental || undefined,
      feedbackContext: buildFeedbackContext(),
    };
  };

  const handleSurpriseMe = () => {
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const pickN = <T,>(arr: T[], n: number): T[] => {
      const shuffled = [...arr].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, n);
    };
    setSelectedGenres(pickN(ALL_GENRES, Math.floor(Math.random() * 3) + 1));
    setSelectedMoods(pickN(MOOD_TAGS, Math.floor(Math.random() * 2) + 1));
    setSelectedInstruments(pickN(INSTRUMENT_TAGS, Math.floor(Math.random() * 3) + 1));
    setVocalGender(pick(["auto", ...ALL_VOCALS]));
    setEnergyLevel(pick(["auto", ...ALL_ENERGIES]));
    setEra(pick(["auto", ...ALL_ERAS]));
    setTempo(pick(ALL_TEMPOS));
    setMode(pick(["cover", "inspired"]));
    if (!showStyleControls) setShowStyleControls(true);
  };

  const applyPreset = (preset: CreativePreset) => {
    if (activePreset === preset.id) {
      setActivePreset(null);
      return;
    }
    setActivePreset(preset.id);
    const s = preset.settings;
    if (s.mode !== undefined) setMode(s.mode);
    if (s.energyLevel !== undefined) setEnergyLevel(s.energyLevel);
    if (s.tempo !== undefined) setTempo(s.tempo ?? null);
    if (s.selectedMoods !== undefined) setSelectedMoods(s.selectedMoods);
    if (s.selectedInstruments !== undefined) setSelectedInstruments(s.selectedInstruments);
    if (s.genreNudge !== undefined) setGenreNudge(s.genreNudge);
    if (s.excludeTags !== undefined) setExcludeTags(s.excludeTags);
    if (!showStyleControls) setShowStyleControls(true);
  };

  const applyMoodSettings = (settings: MoodSettingsResponse) => {
    if (settings.genres?.length) setSelectedGenres(settings.genres.slice(0, MAX_GENRES));
    if (settings.moods?.length) setSelectedMoods(settings.moods.slice(0, MAX_MOODS));
    if (settings.instruments?.length) setSelectedInstruments(settings.instruments.slice(0, MAX_INSTRUMENTS));
    if (settings.energy && settings.energy !== "auto") setEnergyLevel(settings.energy as typeof energyLevel);
    if (settings.tempo) setTempo(settings.tempo as typeof tempo);
    if (settings.era && settings.era !== "auto") setEra(settings.era as typeof era);
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
    const opts = buildOptions();
    lastUrlRef.current = values.youtubeUrl;
    lastOptionsRef.current = opts;
    setApiError(null);
    setRegeneratingSection(null);
    setShowVariations(false);
    setShowVariationWorkshop(false);
    setVariationA(null);
    setVariationB(null);
    setVariationC(null);
    setVariationD(null);
    setSelectedVariation(null);
    setTemplateRating(null);
    setHoverRating(null);
    setRatingSaved(false);
    const usedOpts: UsedOptions = {
      genres: selectedGenres.length > 0 ? selectedGenres : undefined,
      moods: selectedMoods.length > 0 ? selectedMoods : undefined,
      instruments: selectedInstruments.length > 0 ? selectedInstruments : undefined,
      vocalGender: vocalGender !== "auto" ? vocalGender : undefined,
      energyLevel: energyLevel !== "auto" ? energyLevel : undefined,
      era: era !== "auto" ? era : undefined,
      tempo: tempo ?? undefined,
    };
    mainMutation.mutate(
      { data: { youtubeUrl: values.youtubeUrl, ...opts } },
      {
        onSuccess: (data) => {
          setCurrentTemplate(data);
          addToHistory(values.youtubeUrl, data, usedOpts);
          // Persist style settings to per-artist memory
          if (data.artist && (selectedGenres.length > 0 || era !== "auto" || energyLevel !== "auto")) {
            saveArtistStyle(data.artist, {
              genres: selectedGenres.length > 0 ? selectedGenres : undefined,
              era: era !== "auto" ? era : undefined,
              energy: energyLevel !== "auto" ? energyLevel : undefined,
              tempo: tempo ?? undefined,
              moods: selectedMoods.length > 0 ? selectedMoods : undefined,
              instruments: selectedInstruments.length > 0 ? selectedInstruments : undefined,
            });
          }
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

  const handleGenerateWorkshopVariations = (indices: number[]) => {
    if (!lastUrlRef.current || !currentTemplate) return;
    const opts = lastOptionsRef.current as object;
    setIsGeneratingVariations(true);
    setVariationA(null);
    setVariationB(null);
    setVariationC(null);
    setVariationD(null);

    const setters = [setVariationA, setVariationB, setVariationC, setVariationD];
    const mutations = [mainMutation, varBMutation, varCMutation, varDMutation];
    let settled = 0;
    const total = indices.length;
    const checkDone = () => { if (++settled >= total) setIsGeneratingVariations(false); };

    indices.forEach((idx) => {
      const setter = setters[idx - 1];
      const mut = mutations[idx - 1];
      if (!setter || !mut) { checkDone(); return; }
      mut.mutate(
        { data: { youtubeUrl: lastUrlRef.current, ...opts, variationIndex: idx } },
        {
          onSuccess: (data) => { setter(data); checkDone(); },
          onError: () => checkDone(),
        }
      );
    });
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

  const customExclusionCount = customExclusions.split(",").map((s) => s.trim()).filter(Boolean).length;
  const negActiveCount = excludeTags.length + customExclusionCount + (isInstrumental ? 1 : 0);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-start pt-10 px-4 pb-24 overflow-x-hidden">
      {/* Pure black BG — no decorations */}

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

      <div className="relative z-10 w-full max-w-3xl flex flex-col items-center mb-8">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full mb-8"
        >
          {/* Logo + header */}
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[10px] text-primary/60 uppercase tracking-widest border border-primary/20 px-2 py-0.5">v2</span>
            <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">SUNO.AI PROMPT GENERATOR</span>
          </div>
          <img
            src={logoTrackTemplate}
            alt="Track → Template"
            className="h-14 md:h-16 w-auto object-contain mb-2 -ml-1"
            draggable={false}
          />
          <p className="mt-1 text-sm text-zinc-500 font-mono">
            Paste a YouTube link. AI extracts metadata + lyrics and builds a complete Suno prompt.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full space-y-3"
        >
          {/* Mode toggle */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mr-1">Mode</span>
            {(["cover", "inspired"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode((prev) => prev === m ? null : m)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono uppercase tracking-wider border transition-all",
                  mode === m
                    ? "border-primary bg-primary text-black"
                    : "border-primary/20 text-zinc-500 hover:border-primary/50 hover:text-primary"
                )}
              >
                {m === "cover" ? <><Layers className="w-3 h-3" />AI Cover</> : <><Wand2 className="w-3 h-3" />Inspired By</>}
              </button>
            ))}
          </div>

          {/* Creative direction presets */}
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Direction</p>
            <div className="flex flex-wrap gap-1.5">
              {CREATIVE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  title={preset.description}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono border transition-all",
                    activePreset === preset.id
                      ? "border-primary text-primary bg-primary/10"
                      : "border-primary/15 text-zinc-500 hover:border-primary/40 hover:text-zinc-300"
                  )}
                >
                  <span className="text-[10px]">{preset.emoji}</span>{preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* URL input row */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col sm:flex-row gap-2 relative">
            <div className="relative flex-1">
              <div className="flex items-center bg-card border border-primary/25 focus-within:border-primary/70 transition-all overflow-hidden">
                <div className="pl-4 pr-2 text-primary/40">
                  <Youtube className="w-4 h-4" />
                </div>
                <input
                  {...form.register("youtubeUrl")}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full py-3 pr-4 bg-transparent border-none text-foreground placeholder:text-zinc-700 focus:outline-none focus:ring-0 text-sm font-mono"
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
                className="shrink-0 px-3 py-3 sm:py-0 font-mono text-xs uppercase tracking-wider text-zinc-500 border border-primary/20 hover:border-primary/50 hover:text-primary transition-all flex items-center gap-1.5"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Surprise</span>
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="shrink-0 px-6 py-3 sm:py-0 font-mono font-bold text-sm uppercase tracking-wider border border-primary bg-primary text-black hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2"><span className="animate-pulse">◈</span> Analyzing</span>
                ) : (
                  <><Wand2 className="w-3.5 h-3.5" /> Generate</>
                )}
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
                <div className="flex items-center gap-3 p-2.5 bg-card border border-primary/20">
                  {videoPreview.thumbnail && (
                    <img
                      src={videoPreview.thumbnail}
                      alt="thumbnail"
                      className="w-16 h-11 object-cover shrink-0 bg-zinc-900"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {previewLoading && !videoPreview.title ? (
                      <div className="space-y-1.5">
                        <div className="h-2.5 bg-primary/10 animate-pulse w-3/4" />
                        <div className="h-2 bg-primary/5 animate-pulse w-1/2" />
                      </div>
                    ) : videoPreview.title ? (
                      <>
                        <p className="font-mono text-xs text-white truncate">{videoPreview.title}</p>
                        <p className="font-mono text-[10px] text-primary/50 mt-0.5">{videoPreview.author}{videoPreview.duration ? ` · ${videoPreview.duration}` : ""}</p>
                      </>
                    ) : (
                      <p className="font-mono text-[10px] text-zinc-600">YouTube video detected</p>
                    )}
                  </div>
                  <div className="w-1.5 h-1.5 bg-primary shrink-0 animate-pulse" title="Video found" />
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
            {/* Instrumental mode toggle */}
            <button
              type="button"
              onClick={() => setIsInstrumental((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 font-mono text-[11px] uppercase tracking-wider border transition-all",
                isInstrumental
                  ? "border-primary bg-primary text-black"
                  : "border-primary/20 text-zinc-500 hover:border-primary/50 hover:text-primary/80"
              )}
            >
              <Music className="w-3 h-3" />
              Instrumental
              {isInstrumental && <span className="text-[9px] ml-0.5">◉</span>}
            </button>
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
                <div className="bg-card border border-primary/15 p-4 space-y-4">
                  {/* Artist memory banner */}
                  {artistMemoryBanner && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/8 border border-yellow-500/20 text-xs text-yellow-400 font-mono">
                      <BrainCircuit className="w-3.5 h-3.5 shrink-0" />
                      <span>Loaded saved style for <strong>{artistMemoryBanner}</strong></span>
                    </div>
                  )}

                  {/* Suggestion loading indicator */}
                  {suggestLoading && (
                    <div className="flex items-center gap-2 text-[11px] font-mono text-primary/50 animate-pulse">
                      <Sparkles className="w-3 h-3" />
                      AI analyzing genre, era, energy…
                    </div>
                  )}

                  {/* Suggestion applied banner */}
                  {!suggestLoading && suggestions && (
                    <div className="flex items-start justify-between gap-3 px-3 py-2.5 bg-primary/5 border border-primary/20">
                      <div className="flex items-start gap-2 min-w-0">
                        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-primary leading-tight">
                            Auto-detected style
                          </p>
                          <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug truncate">
                            {[
                              suggestions.genres.length > 0 ? suggestions.genres.join(", ") : null,
                              suggestions.era ? `era: ${suggestions.era}` : null,
                              suggestions.energy ? `energy: ${suggestions.energy}` : null,
                              suggestions.tempo ? `tempo: ${suggestions.tempo}` : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSuggestions(null);
                          setSelectedGenres([]);
                          setEra("auto");
                          setEnergyLevel("auto");
                          setTempo(null);
                        }}
                        className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
                        title="Clear suggestions"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest">Style preferences — guide AI output</p>

                  {/* Row 1: Vocal + Energy side by side */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <Mic2 className="w-3 h-3 text-secondary" /> Vocals
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {(["auto", ...ALL_VOCALS] as const).map((v) => (
                          <ChipButton key={v} active={vocalGender === v} onClick={() => setVocalGender(v as typeof vocalGender)}>
                            {v === "auto" ? "Auto" : v.charAt(0).toUpperCase() + v.slice(1)}
                          </ChipButton>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <Zap className="w-3 h-3 text-secondary" /> Energy
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {(["auto", ...ALL_ENERGIES] as const).map((v) => (
                          <ChipButton key={v} active={energyLevel === v} onClick={() => setEnergyLevel(v as typeof energyLevel)}>
                            {v === "auto" ? "Auto" : v.charAt(0).toUpperCase() + v.slice(1)}
                          </ChipButton>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Tempo + Era side by side */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <Gauge className="w-3 h-3 text-secondary" /> Tempo
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {(ALL_TEMPOS as readonly string[]).map((v) => {
                          const labels: Record<string, string> = {
                            ballad: "Ballad", slow: "Slow", mid: "Mid", groove: "Groove",
                            uptempo: "Up-tempo", fast: "Fast", hyper: "Hyper",
                          };
                          return (
                            <ChipButton key={v} active={tempo === v} onClick={() => setTempo((prev) => prev === v ? null : v as typeof tempo)}>
                              {labels[v]}
                            </ChipButton>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <Clock className="w-3 h-3 text-secondary" /> Era
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {(["auto", ...ALL_ERAS] as const).map((v) => (
                          <ChipButton key={v} active={era === v} onClick={() => setEra(v as typeof era)}>
                            {v === "auto" ? "Auto" : v}
                          </ChipButton>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Mood / Vibe */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      <Smile className="w-3 h-3 text-secondary" /> Mood / Vibe
                      <span className="text-[10px] text-zinc-600 font-normal normal-case tracking-normal">(up to {MAX_MOODS})</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {MOOD_TAGS.map((mood) => {
                        const isSelected = selectedMoods.includes(mood);
                        const isDisabled = !isSelected && selectedMoods.length >= MAX_MOODS;
                        return (
                          <button
                            key={mood}
                            type="button"
                            onClick={() => !isDisabled && setSelectedMoods((p) => toggleSet(p, mood, MAX_MOODS))}
                            className={cn(
                              "px-2.5 py-0.5 font-mono text-[11px] border transition-all",
                              isSelected ? "border-primary text-primary bg-primary/10"
                                : isDisabled ? "opacity-20 cursor-not-allowed border-primary/10 text-zinc-600"
                                : "border-primary/15 text-zinc-500 hover:border-primary/40 hover:text-zinc-300"
                            )}
                          >
                            {mood}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Instruments */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      <Piano className="w-3 h-3 text-secondary" /> Instruments
                      <span className="text-[10px] text-zinc-600 font-normal normal-case tracking-normal">(up to {MAX_INSTRUMENTS})</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {INSTRUMENT_TAGS.map((inst) => {
                        const isSelected = selectedInstruments.includes(inst);
                        const isDisabled = !isSelected && selectedInstruments.length >= MAX_INSTRUMENTS;
                        return (
                          <button
                            key={inst}
                            type="button"
                            onClick={() => !isDisabled && setSelectedInstruments((p) => toggleSet(p, inst, MAX_INSTRUMENTS))}
                            className={cn(
                              "px-2.5 py-0.5 font-mono text-[11px] border transition-all",
                              isSelected ? "border-primary text-primary bg-primary/10"
                                : isDisabled ? "opacity-20 cursor-not-allowed border-primary/10 text-zinc-600"
                                : "border-primary/15 text-zinc-500 hover:border-primary/40 hover:text-zinc-300"
                            )}
                          >
                            {inst}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Genre Picker */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <Tags className="w-3 h-3 text-secondary" /> Genres
                        <span className="text-[10px] text-zinc-600 font-normal normal-case tracking-normal">(up to {MAX_GENRES})</span>
                      </label>
                      {selectedGenres.length > 0 && (
                        <button type="button" onClick={() => setSelectedGenres([])} className="text-[11px] text-zinc-500 hover:text-destructive transition-colors">Clear all</button>
                      )}
                    </div>
                    {selectedGenres.length > 0 && (
                      <div className="flex flex-wrap gap-1 p-2 bg-primary/5 border border-primary/20">
                        {selectedGenres.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setSelectedGenres((p) => p.filter((x) => x !== g))}
                            className="flex items-center gap-0.5 px-2 py-0.5 font-mono text-[11px] bg-primary/15 text-primary border border-primary/30 hover:border-destructive/40 hover:text-destructive transition-colors"
                          >
                            {g}<span className="text-[9px] leading-none ml-0.5">✕</span>
                          </button>
                        ))}
                        <span className="flex items-center font-mono text-[10px] text-primary/40 ml-1">{selectedGenres.length}/{MAX_GENRES}</span>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {GENRE_CATEGORIES.map((cat) => {
                        const isExpanded = expandedGenreCategory === cat.label;
                        const displayedGenres = isExpanded ? cat.genres : cat.genres.slice(0, 7);
                        const hasMore = cat.genres.length > 7;
                        const catSelected = cat.genres.filter((g) => selectedGenres.includes(g)).length;
                        return (
                          <div key={cat.label} className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">{cat.label}</span>
                              {catSelected > 0 && <span className="font-mono text-[9px] text-primary border border-primary/30 px-1">{catSelected}</span>}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {displayedGenres.map((genre) => {
                                const isSelected = selectedGenres.includes(genre);
                                const isDisabled = !isSelected && selectedGenres.length >= MAX_GENRES;
                                return (
                                  <button
                                    key={genre}
                                    type="button"
                                    onClick={() => !isDisabled && setSelectedGenres((p) => toggleSet(p, genre, MAX_GENRES))}
                                    className={cn(
                                      "px-2 py-0.5 font-mono text-[11px] border transition-all",
                                      isSelected ? "border-primary text-primary bg-primary/10"
                                        : isDisabled ? "border-primary/10 text-zinc-700 cursor-not-allowed opacity-40"
                                        : "border-primary/15 text-zinc-500 hover:border-primary/40 hover:text-zinc-300"
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
                                  className="px-2 py-0.5 font-mono text-[11px] border border-dashed border-primary/20 text-zinc-600 hover:text-primary/60 hover:border-primary/30 transition-colors"
                                >
                                  {isExpanded ? "less" : `+${cat.genres.length - 7}`}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Genre nudge */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      <Music2 className="w-3 h-3 text-secondary" /> Custom nudge
                      <span className="text-[10px] text-zinc-600 font-normal normal-case tracking-normal">(free text)</span>
                    </label>
                    <input
                      value={genreNudge}
                      onChange={(e) => setGenreNudge(e.target.value)}
                      placeholder='e.g. "more trap", "jazz influence", "synthwave vibes"'
                      className="w-full px-3 py-2 rounded-lg bg-background/50 border border-border text-xs text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-colors"
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
                <div className="bg-card border border-primary/15 p-5 space-y-5">

                  {/* Quality / vibe exclusions */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Quality & Vibe</p>
                      {excludeTags.some((t) => QUALITY_EXCLUSIONS.map((q) => q.value).includes(t)) && (
                        <button type="button" onClick={() => setExcludeTags((p) => p.filter((t) => !QUALITY_EXCLUSIONS.map((q) => q.value).includes(t)))} className="text-[11px] text-zinc-500 hover:text-destructive transition-colors">Clear</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {QUALITY_EXCLUSIONS.map((preset) => {
                        const isChecked = excludeTags.includes(preset.value);
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => setExcludeTags((prev) => isChecked ? prev.filter((t) => t !== preset.value) : [...prev, preset.value])}
                            className={cn(
                              "px-2.5 py-0.5 font-mono text-[11px] border transition-all",
                              isChecked
                                ? "border-destructive/40 text-destructive bg-destructive/8"
                                : "border-primary/15 text-zinc-500 hover:border-destructive/30 hover:text-zinc-300"
                            )}
                          >
                            {isChecked && <span className="mr-1 text-[9px]">✕</span>}{preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Element / instrument exclusions */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Elements & Instruments</p>
                        <p className="font-mono text-[9px] text-zinc-700 tracking-wide mt-0.5">exclude from output</p>
                      </div>
                      {ELEMENT_EXCLUSIONS.some((e) => e.value.split(",").some((v) => excludeTags.includes(v))) && (
                        <button type="button" onClick={() => setExcludeTags((p) => p.filter((t) => !ELEMENT_EXCLUSIONS.flatMap((e) => e.value.split(",")).includes(t)))} className="text-[11px] text-zinc-500 hover:text-destructive transition-colors">Clear</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ELEMENT_EXCLUSIONS.map((preset) => {
                        const tags = preset.value.split(",");
                        const isChecked = tags.some((t) => excludeTags.includes(t));
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => setExcludeTags((prev) => {
                              if (isChecked) return prev.filter((t) => !tags.includes(t));
                              return [...new Set([...prev, ...tags])];
                            })}
                            className={cn(
                              "px-2.5 py-0.5 font-mono text-[11px] border transition-all",
                              isChecked
                                ? "border-destructive/40 text-destructive bg-destructive/8"
                                : "border-primary/15 text-zinc-500 hover:border-destructive/30 hover:text-zinc-300"
                            )}
                          >
                            {isChecked && <span className="mr-1 text-[9px]">✕</span>}{preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom freetext exclusions */}
                  <div className="space-y-1.5">
                    <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Custom terms</p>
                    <input
                      type="text"
                      value={customExclusions}
                      onChange={(e) => setCustomExclusions(e.target.value)}
                      placeholder="e.g. no flute, no church bells, no whistling"
                      className="w-full px-3 py-2 bg-background border border-primary/20 text-xs text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-destructive/40 transition-colors font-mono"
                    />
                    <p className="font-mono text-[10px] text-zinc-700">Comma-separated — added directly to the negative prompt.</p>
                  </div>

                  {/* Live preview */}
                  {(excludeTags.length > 0 || customExclusions.trim()) && (
                    <div className="font-mono text-[11px] text-zinc-500 bg-background px-3 py-2.5 border border-primary/15 leading-relaxed">
                      <span className="font-mono text-[10px] text-zinc-700 uppercase tracking-wider">Excluding: </span>
                      <span className="text-primary/70">
                        {[...excludeTags, ...customExclusions.split(",").map((s) => s.trim()).filter(Boolean)].join(", ")}
                      </span>
                    </div>
                  )}

                  {/* Clear all */}
                  {(excludeTags.length > 0 || customExclusions.trim()) && (
                    <button type="button" onClick={() => { setExcludeTags([]); setCustomExclusions(""); }} className="text-xs text-zinc-500 hover:text-destructive transition-colors">
                      Clear all exclusions
                    </button>
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
                <div className="bg-card border border-primary/15 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
                      Override automatic lyrics — paste custom lyrics below
                    </p>
                    {manualLyrics.trim().length > 0 && (
                      <span className="font-mono text-[10px] text-primary/60">{manualLyrics.trim().length} chars</span>
                    )}
                  </div>
                  <textarea
                    value={manualLyrics}
                    onChange={(e) => setManualLyrics(e.target.value)}
                    placeholder={"Paste song lyrics here...\n\nThese will be used instead of the auto-fetched lyrics."}
                    rows={8}
                    className="w-full px-3 py-2.5 bg-background border border-primary/20 text-sm text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-primary/50 transition-colors resize-y font-mono leading-relaxed"
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
                <div className="bg-card border border-primary/15 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Recent generations</p>
                    <button type="button" onClick={handleClearHistory} className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-600 hover:text-destructive transition-colors uppercase tracking-wider">
                      <Trash2 className="w-3 h-3" /> Clear all
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                    {history.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleLoadHistory(entry)}
                        className="w-full text-left px-3 py-2.5 bg-background hover:bg-primary/5 border border-primary/10 hover:border-primary/30 transition-all group"
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

      {/* Example gallery — shown only when nothing has been generated yet */}
      {!currentTemplate && !isLoading && (
        <div className="relative z-10 flex justify-center px-4">
          <ExampleGallery
            onSelect={(url) => {
              form.setValue("youtubeUrl", url);
              form.clearErrors("youtubeUrl");
            }}
          />
        </div>
      )}

      {/* Utility Toolbar */}
      <div className="relative z-10 w-full max-w-3xl mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => { setShowMoodBoard((v) => !v); setShowBatchMode(false); setShowAnalytics(false); setShowReverseMode(false); setShowGenreMap(false); }}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border transition-all",
            showMoodBoard ? "border-primary/50 text-primary bg-primary/8" : "border-primary/15 text-zinc-600 hover:border-primary/40 hover:text-zinc-400"
          )}
        >
          <Sparkles className="w-3 h-3" /> Mood Board
        </button>
        <button
          type="button"
          onClick={() => { setShowBatchMode((v) => !v); setShowMoodBoard(false); setShowAnalytics(false); setShowReverseMode(false); setShowGenreMap(false); }}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border transition-all",
            showBatchMode ? "border-primary/50 text-primary bg-primary/8" : "border-primary/15 text-zinc-600 hover:border-primary/40 hover:text-zinc-400"
          )}
        >
          <Layers className="w-3 h-3" /> Batch Mode
        </button>
        <button
          type="button"
          onClick={() => { setShowReverseMode((v) => !v); setShowMoodBoard(false); setShowBatchMode(false); setShowAnalytics(false); setShowGenreMap(false); }}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border transition-all",
            showReverseMode ? "border-primary/50 text-primary bg-primary/8" : "border-primary/15 text-zinc-600 hover:border-primary/40 hover:text-zinc-400"
          )}
        >
          <Wand2 className="w-3 h-3" /> Reverse Mode
        </button>
        <button
          type="button"
          onClick={() => { setShowGenreMap((v) => !v); setShowMoodBoard(false); setShowBatchMode(false); setShowAnalytics(false); setShowReverseMode(false); }}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border transition-all",
            showGenreMap ? "border-primary/50 text-primary bg-primary/8" : "border-primary/15 text-zinc-600 hover:border-primary/40 hover:text-zinc-400"
          )}
        >
          <Network className="w-3 h-3" /> Genre Map
        </button>
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => { setShowAnalytics((v) => !v); setShowMoodBoard(false); setShowBatchMode(false); setShowReverseMode(false); setShowGenreMap(false); }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border transition-all",
              showAnalytics ? "border-primary/50 text-primary bg-primary/8" : "border-primary/15 text-zinc-600 hover:border-primary/40 hover:text-zinc-400"
            )}
          >
            <BarChart2 className="w-3 h-3" /> Analytics
          </button>
        )}
      </div>

      {/* Utility Panels */}
      <div className="relative z-10 w-full max-w-3xl">
        <AnimatePresence>
          {showMoodBoard && (
            <MoodBoard
              onApplySettings={applyMoodSettings}
              onClose={() => setShowMoodBoard(false)}
              className="mb-4"
            />
          )}
          {showBatchMode && (
            <BatchMode
              onClose={() => setShowBatchMode(false)}
              className="mb-4"
            />
          )}
          {showReverseMode && (
            <ReverseMode
              onClose={() => setShowReverseMode(false)}
              className="mb-4"
            />
          )}
          {showGenreMap && (
            <GenreGenomeMap
              activeGenres={selectedGenres}
              onSelectGenre={(genre) => {
                setSelectedGenres((prev) => {
                  if (prev.includes(genre)) return prev.filter((g) => g !== genre);
                  if (prev.length >= MAX_GENRES) return prev;
                  return [...prev, genre];
                });
                if (!showStyleControls) setShowStyleControls(true);
              }}
              onClose={() => setShowGenreMap(false)}
              className="mb-4"
            />
          )}
          {showAnalytics && (
            <AnalyticsDashboard
              history={history}
              onClose={() => setShowAnalytics(false)}
              className="mb-4"
            />
          )}
        </AnimatePresence>
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
                      <div className="flex items-center justify-center h-40 border border-primary/10 bg-card">
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
                  className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-primary/20 text-zinc-500 hover:border-primary/50 hover:text-primary transition-all disabled:opacity-30"
                >
                  <Layers className="w-3 h-3" /> A/B Compare
                </button>
                <button
                  type="button"
                  onClick={() => setShowVariationWorkshop((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
                    showVariationWorkshop ? "border-primary/40 text-primary" : "border-primary/20 text-zinc-500 hover:border-primary/50 hover:text-primary"
                  )}
                >
                  <Shuffle className="w-3 h-3" /> Variation Workshop
                </button>
                <button
                  type="button"
                  onClick={() => setShowMultiTrack((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
                    showMultiTrack ? "border-primary/40 text-primary" : "border-primary/20 text-zinc-500 hover:border-primary/50 hover:text-primary"
                  )}
                >
                  <ListMusic className="w-3 h-3" /> Multi-Track
                </button>
                <button
                  type="button"
                  onClick={() => setShowTransition((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
                    showTransition ? "border-primary/40 text-primary" : "border-primary/20 text-zinc-500 hover:border-primary/50 hover:text-primary"
                  )}
                >
                  <GitMerge className="w-3 h-3" /> Transition
                </button>
                <button
                  type="button"
                  onClick={handleShareTemplate}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all",
                    shareToast === "copied"
                      ? "border-primary/40 text-primary"
                      : "border-primary/20 text-zinc-500 hover:border-primary/50 hover:text-primary"
                  )}
                >
                  {shareToast === "copied" ? <><Check className="w-3 h-3" /> Link copied!</> : <><Share2 className="w-3 h-3" /> Share</>}
                </button>
              </div>

              {/* Multi-Track Builder panel */}
              <AnimatePresence>
                {showMultiTrack && (
                  <div className="max-w-6xl mx-auto mb-4 px-1">
                    <MultiTrackBuilder
                      youtubeUrl={lastUrlRef.current}
                      options={lastOptionsRef.current as Record<string, unknown>}
                      onSelectTemplate={(t) => setCurrentTemplate(t)}
                      onClose={() => setShowMultiTrack(false)}
                    />
                  </div>
                )}
              </AnimatePresence>

              {/* Transition Builder panel */}
              <AnimatePresence>
                {showTransition && (
                  <div className="max-w-6xl mx-auto mb-4 px-1">
                    <TransitionBuilder
                      currentYoutubeUrl={lastUrlRef.current}
                      onClose={() => setShowTransition(false)}
                    />
                  </div>
                )}
              </AnimatePresence>

              {/* Variation Workshop panel */}
              <AnimatePresence>
                {showVariationWorkshop && currentTemplate && (
                  <div className="max-w-6xl mx-auto mb-4 px-1">
                    <VariationWorkshop
                      baseTemplate={currentTemplate}
                      onGenerateVariations={handleGenerateWorkshopVariations}
                      isGenerating={isGeneratingVariations}
                      variationA={variationA}
                      variationB={variationB}
                      variationC={variationC}
                      variationD={variationD}
                      onSelectTemplate={(t) => { setCurrentTemplate(t); setShowVariationWorkshop(false); }}
                      onClose={() => setShowVariationWorkshop(false)}
                    />
                  </div>
                )}
              </AnimatePresence>
              <TemplateResult
                template={currentTemplate}
                regeneratingSection={regeneratingSection}
                onRegenerateSection={handleRegenerateSection}
                metadata={{
                  energy: energyLevel !== "auto" ? energyLevel : undefined,
                  tempo: tempo ?? undefined,
                  genres: selectedGenres.length > 0 ? selectedGenres : undefined,
                  moods: selectedMoods.length > 0 ? selectedMoods : undefined,
                  instruments: selectedInstruments.length > 0 ? selectedInstruments : undefined,
                }}
                onMultiTrack={() => setShowMultiTrack(true)}
                onTransition={() => setShowTransition(true)}
                onRestoreVersion={(t) => setCurrentTemplate({ ...currentTemplate, ...t })}
              />

              {/* Rating bar */}
              <div className="flex items-center justify-center gap-3 mt-4 py-2.5 px-5 bg-card border border-primary/10 max-w-6xl mx-auto">
                <span className="text-xs text-zinc-400 mr-1 shrink-0">Rate this template:</span>
                <div
                  className="flex items-center gap-0.5"
                  onMouseLeave={() => setHoverRating(null)}
                >
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = (hoverRating ?? templateRating ?? 0) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => rateCurrentTemplate(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
                        aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                      >
                        <Star
                          className={cn(
                            "w-6 h-6 transition-colors",
                            active
                              ? hoverRating !== null
                                ? "fill-yellow-300 text-yellow-300"
                                : "fill-yellow-400 text-yellow-400"
                              : "fill-transparent text-zinc-600 hover:text-zinc-400"
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
                {templateRating !== null && (
                  <span className="text-xs text-zinc-400 ml-0.5">
                    {templateRating === 1 ? "Poor" : templateRating === 2 ? "Fair" : templateRating === 3 ? "Good" : templateRating === 4 ? "Great" : "Perfect"}
                  </span>
                )}
                {ratingSaved && (
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <Check className="w-3 h-3 text-green-400" /> Saved
                  </span>
                )}
                {(() => {
                  const ratedCount = history.filter((e) => typeof e.rating === "number").length;
                  if (ratedCount < 2) return null;
                  return (
                    <span className="flex items-center gap-1 text-xs text-violet-400 ml-auto shrink-0">
                      <BrainCircuit className="w-3 h-3" /> Learning from {ratedCount} ratings
                    </span>
                  );
                })()}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Attribution footer — required by GetSongBPM API terms */}
      <div className="w-full max-w-3xl mt-8 pb-6 flex items-center justify-center gap-1.5 font-mono text-[10px] text-zinc-700">
        <span>BPM &amp; KEY DETECTION POWERED BY</span>
        <a
          href="https://getsongbpm.com"
          target="_blank"
          rel="noopener"
          className="text-zinc-500 hover:text-primary transition-colors underline underline-offset-2"
        >
          GetSongBPM
        </a>
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
        "flex items-center gap-1.5 px-3 py-1 font-mono text-[11px] uppercase tracking-wider border transition-all",
        active
          ? "border-primary text-primary bg-primary/8"
          : "border-primary/20 text-zinc-500 hover:border-primary/50 hover:text-primary/80"
      )}
    >
      {icon}
      {label}
      {activeCount > 0 && (
        <span className="ml-0.5 px-1.5 bg-primary text-black text-[9px] font-bold">
          {activeCount}
        </span>
      )}
      <ChevronDown className={cn("w-3 h-3 ml-0.5 transition-transform duration-200", active && "rotate-180")} />
    </button>
  );
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1 font-mono text-[11px] border transition-all",
        active
          ? "border-primary text-primary bg-primary/10"
          : "border-primary/15 text-zinc-500 hover:border-primary/40 hover:text-zinc-300"
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
