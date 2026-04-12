import { Router, type IRouter } from "express";
import { GenerateSunoTemplateBody, GenerateSunoTemplateResponse, GenerateVariationsBody, BatchGenerateBody, TransformTemplateBody } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import ytdl from "@distube/ytdl-core";
import { parse as parseHtml } from "node-html-parser";
import { detectAudioFeatures, type AudioFeatures } from "../lib/audioFeatures.js";
import { analyzeLyricsStructure } from "../lib/lyricsStructure.js";
import { computeSuggestedDefaults } from "../lib/suggestedDefaults.js";
import { cacheGet, cacheSet, cacheStats, hashParams, TTL } from "../lib/cache.js";
import { computeFingerprint } from "../lib/fingerprint.js";
import { validateWithPython } from "../lib/pythonValidator.js";

const AI_MODEL      = process.env.AI_MODEL      ?? "llama-3.3-70b-versatile";
const AI_MINI_MODEL = process.env.AI_MINI_MODEL ?? "llama-3.1-8b-instant";

const router: IRouter = Router();

interface MusicBrainzData {
  releaseYear?: string;
  genres?: string[];
  label?: string;
  album?: string;
  isrc?: string;
}

interface DescriptionMusicData {
  producedBy?: string;
  writtenBy?: string;
  album?: string;
  label?: string;
  releaseYear?: string;
  bpm?: string;
  key?: string;
}

/** Stage 1 cache payload — base video info, no lyrics, no audio features. TTL: 7d */
interface BaseVideoMetadata {
  title: string;
  author: string;
  description: string;
  keywords: string[];
  category: string;
  duration: string;
  durationSeconds: number | null;
  captionText: string | null;
  cleanTitle: string;
  cleanArtist: string;
  musicBrainz?: MusicBrainzData;
  descriptionData?: DescriptionMusicData;
}

/** Stage 2 cache payload — audio features only. TTL: permanent (deterministic). */
interface CachedAudioFeatures {
  features: AudioFeatures | null;
}

/** Stage 3 cache payload — lyrics and language. TTL: 7d */
interface CachedLyrics {
  lyricsText: string | null;
  lyricsSource: "api" | "captions" | "none";
  lyricsProvider?: "genius" | "lrclib" | "lyrics.ovh";
  lyricsHasStructure?: boolean;
  language?: string;
}

/** Full assembled metadata used throughout the route logic. */
interface VideoMetadata extends BaseVideoMetadata {
  lyricsText: string | null;
  lyricsSource: "user-override" | "api" | "captions" | "none";
  lyricsProvider?: "genius" | "lrclib" | "lyrics.ovh";
  lyricsHasStructure?: boolean;
  language?: string;
  audioFeatures?: AudioFeatures;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Strips common YouTube title suffixes to get a clean song title for lyrics lookup.
 * e.g. "Never Gonna Give You Up (Official Video) (4K Remaster)" → "Never Gonna Give You Up"
 */
function cleanSongTitle(rawTitle: string, artistName: string): { cleanTitle: string; cleanArtist: string } {
  let title = rawTitle.trim();
  let artist = artistName.trim();

  // If the title starts with "Artist - Song", split them
  const dashIdx = title.indexOf(" - ");
  if (dashIdx > 0) {
    const leftPart = title.slice(0, dashIdx).trim();
    const rightPart = title.slice(dashIdx + 3).trim();
    // Check if leftPart looks like an artist name (not a sentence)
    if (leftPart.split(" ").length <= 5) {
      artist = leftPart;
      title = rightPart;
    }
  }

  // Remove bracketed/parenthesized YouTube-specific suffixes
  const suffixPatterns = [
    /\s*\(official\s+(music\s+)?video\)/gi,
    /\s*\(official\s+audio\)/gi,
    /\s*\(lyric\s+video\)/gi,
    /\s*\(lyrics?\s+video\)/gi,
    /\s*\(official\s+lyrics?\)/gi,
    /\s*\(official\s+visuali[sz]er\)/gi,
    /\s*\[official\s+(music\s+)?video\]/gi,
    /\s*\(4k(\s+remaster(ed)?)?\)/gi,
    /\s*\(remaster(ed)?(\s+\d{4})?\)/gi,
    /\s*\(\d{4}\s+remaster(ed)?\)/gi,
    /\s*\(hd\)/gi,
    /\s*\(hq\)/gi,
    /\s*\(audio\)/gi,
    /\s*\(visuali[sz]er\)/gi,
    /\s*\(live\s+(at\s+\w+)?\)/gi,
    /\s*\(explicit\)/gi,
    /\s*\(clean\)/gi,
    /\s*\(radio\s+edit\)/gi,
    /\s*\(single\)/gi,
    /\s*\(album\s+version\)/gi,
    /\s*-\s*(ft|feat)\.?\s+[^([\n]+/gi,
    /\s*\(ft\.?\s+[^)]+\)/gi,
    /\s*\(feat\.?\s+[^)]+\)/gi,
  ];

  for (const pattern of suffixPatterns) {
    title = title.replace(pattern, "");
  }

  return { cleanTitle: title.trim(), cleanArtist: artist.trim() };
}

/**
 * Fetch lyrics from the free lyrics.ovh API.
 * API: GET https://api.lyrics.ovh/v1/{artist}/{title}
 * Returns { lyrics: string } or { error: string }
 */
async function fetchLyricsFromAPI(artist: string, title: string): Promise<string | null> {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "SunoTemplateGenerator/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) return null;

    const data = await resp.json() as { lyrics?: string; error?: string };
    if (!data.lyrics || data.error) return null;

    const lyrics = data.lyrics
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();

    return lyrics.length > 50 ? lyrics : null;
  } catch {
    return null;
  }
}

/**
 * Fetch lyrics from lrclib.net — higher coverage and reliability than lyrics.ovh.
 * API: GET https://lrclib.net/api/get?artist_name=...&track_name=...&duration=...
 * Falls back to search endpoint if exact match fails.
 */
async function fetchLyricsFromLrcLib(artist: string, title: string, durationSec?: number): Promise<string | null> {
  try {
    // Primary: exact lookup with optional duration for disambiguation
    const params = new URLSearchParams({ artist_name: artist, track_name: title });
    if (durationSec) params.set("duration", String(Math.round(durationSec)));
    const getUrl = `https://lrclib.net/api/get?${params.toString()}`;

    const primaryResp = await fetch(getUrl, {
      headers: { "Lrclib-Client": "SunoTemplateGenerator/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (primaryResp.ok) {
      const data = await primaryResp.json() as { plainLyrics?: string; instrumental?: boolean };
      if (data.instrumental) return null;
      if (data.plainLyrics && data.plainLyrics.length > 50) return data.plainLyrics.trim();
    }

    // Fallback: search
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
    const searchResp = await fetch(searchUrl, {
      headers: { "Lrclib-Client": "SunoTemplateGenerator/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!searchResp.ok) return null;

    const results = await searchResp.json() as Array<{ plainLyrics?: string; instrumental?: boolean }>;
    const best = results.find((r) => !r.instrumental && r.plainLyrics && r.plainLyrics.length > 50);
    return best?.plainLyrics?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Simple heuristic language detector from lyrics text.
 * Checks Unicode character ranges. Falls back to "English".
 */
function detectLanguage(text: string): string {
  if (!text || text.length < 20) return "English";
  const sample = text.slice(0, 600);
  if (/[\uac00-\ud7af]/.test(sample)) return "Korean";
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sample)) return "Japanese";
  if (/[\u4e00-\u9fff]/.test(sample)) return "Chinese";
  if (/[\u0600-\u06ff]/.test(sample)) return "Arabic";
  if (/[\u0400-\u04ff]/.test(sample)) return "Russian";
  if (/[\u0e00-\u0e7f]/.test(sample)) return "Thai";
  if (/[\u0900-\u097f]/.test(sample)) return "Hindi";
  if (/[ñÑ]/.test(sample)) return "Spanish";
  if (/[çÇèÈêÊ]/.test(sample)) return "French";
  if (/[üÜäÄöÖß]/.test(sample)) return "German";
  if (/[ãÃõÕ]/.test(sample)) return "Portuguese";
  return "English";
}

/**
 * Parse a Genius lyrics HTML container div into plain text.
 * Preserves [Verse 1], [Chorus] etc. section headers embedded in the HTML.
 * Converts <br> to newlines, strips all other tags.
 */
function parseGeniusContainer(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * Fetch song lyrics from Genius.com using the Genius API + page scraping.
 * Returns { lyrics, hasStructure } where hasStructure=true means the lyrics
 * already contain [Verse 1], [Chorus] etc. section tags from Genius.
 */
async function fetchLyricsFromGenius(artist: string, title: string): Promise<{ lyrics: string; hasStructure: boolean } | null> {
  const token = process.env.GENIUS_API_TOKEN;
  if (!token) return null;

  try {
    const searchResp = await fetch(
      `https://api.genius.com/search?q=${encodeURIComponent(`${title} ${artist}`)}`,
      {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "SunoTemplateGenerator/1.0" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!searchResp.ok) return null;

    const searchData = await searchResp.json() as {
      response: {
        hits: Array<{
          type: string;
          result: { id: number; url: string; title: string; primary_artist: { name: string }; lyrics_state: string };
        }>;
      };
    };

    const hits = searchData.response.hits.filter((h) => h.type === "song" && h.result.lyrics_state === "complete");
    if (hits.length === 0) return null;

    // Score hits by title/artist similarity
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const nt = norm(title), na = norm(artist);
    const scored = hits.map((h) => {
      const ht = norm(h.result.title), ha = norm(h.result.primary_artist.name);
      let score = 0;
      if (ht === nt) score += 10; else if (ht.includes(nt) || nt.includes(ht)) score += 5;
      if (ha === na) score += 10; else if (ha.includes(na) || na.includes(ha)) score += 5;
      return { h, score };
    }).sort((a, b) => b.score - a.score);

    const bestUrl = scored[0].h.result.url;

    // Fetch and parse the Genius lyrics page
    const pageResp = await fetch(bestUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!pageResp.ok) return null;

    const html = await pageResp.text();
    const root = parseHtml(html);
    const containers = root.querySelectorAll("[data-lyrics-container='true']");
    if (containers.length === 0) {
      console.warn("[genius] no lyrics containers found in page");
      return null;
    }

    let lyrics = "";
    let hasStructure = false;
    for (const container of containers) {
      const text = parseGeniusContainer(container.innerHTML);
      lyrics += text + "\n\n";
      if (/\[(?:Verse|Chorus|Bridge|Pre-?Chorus|Outro|Intro|Hook)\s*\d*\b/i.test(text)) hasStructure = true;
    }

    lyrics = lyrics.trim();
    if (lyrics.length < 50) return null;
    console.log(`[genius] ${artist} – ${title} → ${lyrics.length} chars, structure=${hasStructure}`);
    return { lyrics, hasStructure };
  } catch (err) {
    console.warn("[genius] error:", (err as Error).message?.slice(0, 80));
    return null;
  }
}

/**
 * Fetch verified musical metadata from MusicBrainz.
 * Returns: release year, genre tags, label, album name, ISRC.
 * Rate limit: 1 req/s — use AbortSignal.timeout to avoid blocking.
 */
async function fetchMusicBrainzData(artist: string, title: string, durationSec?: number): Promise<MusicBrainzData> {
  try {
    const query = `recording:"${title}" AND artist:"${artist}"`;
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5&inc=releases+genres+isrcs`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "SunoTemplateGenerator/1.0 (suno-template-gen@example.com)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return {};

    const data = await resp.json() as {
      recordings?: Array<{
        title: string;
        length?: number;
        isrcs?: string[];
        genres?: Array<{ name: string; count: number }>;
        releases?: Array<{
          title: string;
          date?: string;
          "label-info"?: Array<{ label?: { name: string } }>;
        }>;
      }>;
    };

    if (!data.recordings || data.recordings.length === 0) return {};

    // Pick best recording by duration proximity if available
    let best = data.recordings[0];
    if (durationSec && data.recordings.length > 1) {
      const targetMs = durationSec * 1000;
      best = data.recordings.reduce((acc, r) => {
        if (!r.length) return acc;
        const diff = Math.abs(r.length - targetMs);
        const accDiff = acc.length ? Math.abs(acc.length - targetMs) : Infinity;
        return diff < accDiff ? r : acc;
      }, data.recordings[0]);
    }

    const releases = best.releases ?? [];
    const dates = releases.map((r) => r.date).filter(Boolean).sort() as string[];
    const releaseYear = dates[0]?.slice(0, 4);
    const genres = (best.genres ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map((g) => g.name);
    const label = releases[0]?.["label-info"]?.[0]?.label?.name;
    const album = releases.find((r) => r.date === dates[0])?.title ?? releases[0]?.title;
    const isrc = best.isrcs?.[0];

    return { releaseYear, genres: genres.length > 0 ? genres : undefined, label, album, isrc };
  } catch {
    return {};
  }
}

/**
 * Parse a YouTube video description for embedded music metadata:
 * producer credits, writer credits, album, label, release year, BPM, key.
 */
function parseDescriptionForMusicData(description: string): DescriptionMusicData {
  if (!description) return {};
  const result: DescriptionMusicData = {};

  // Release year (4-digit year between 1950–2030, prioritise near label copyright symbol)
  const labelYearMatch = description.match(/[℗©]\s*(19[5-9]\d|20[0-2]\d)/);
  const standaloneYearMatch = description.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  result.releaseYear = labelYearMatch?.[1] ?? standaloneYearMatch?.[1];

  // Produced by
  const prodMatch = description.match(/[Pp]roduced?\s+by[:\s]+([^\n,;()[\]]+)/);
  if (prodMatch) result.producedBy = prodMatch[1].trim().slice(0, 80);

  // Written by / Words by / Lyrics by
  const writtenMatch = description.match(/(?:[Ww]ritten?|[Ww]ords?|[Ll]yrics?)\s+by[:\s]+([^\n,;()[\]]+)/);
  if (writtenMatch) result.writtenBy = writtenMatch[1].trim().slice(0, 80);

  // Album
  const albumMatch = description.match(/(?:from the album|off the album|album[:\s]+"?)([^"\n.;,()[\]]+)/i);
  if (albumMatch) result.album = albumMatch[1].trim().replace(/['"]/g, "").slice(0, 60);

  // Label (℗ or © pattern)
  const labelMatch = description.match(/[℗©]\s*(?:19[5-9]\d|20[0-2]\d)\s+([^\n,;()[\]]+)/);
  if (labelMatch) result.label = labelMatch[1].trim().slice(0, 60);

  // BPM
  const bpmMatch = description.match(/(\d{2,3})\s*(?:bpm|BPM)/);
  if (bpmMatch) result.bpm = bpmMatch[1];

  // Key
  const keyMatch = description.match(/\b(?:key\s+of\s+)?([A-G][b#]?\s*(?:major|minor|maj|min))\b/i);
  if (keyMatch) result.key = keyMatch[1].trim();

  return result;
}

async function fetchCaptions(info: ytdl.videoInfo): Promise<string | null> {
  try {
    const tracks =
      (info.player_response as Record<string, unknown> & {
        captions?: {
          playerCaptionsTracklistRenderer?: {
            captionTracks?: Array<{
              baseUrl: string;
              languageCode: string;
              kind?: string;
            }>;
          };
        };
      }).captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!tracks || tracks.length === 0) return null;

    // Prefer manual (non-ASR) English captions, then any English, then first available
    const enTrack =
      tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ??
      tracks.find((t) => t.languageCode === "en") ??
      tracks[0];

    if (!enTrack) return null;

    const resp = await fetch(enTrack.baseUrl);
    if (!resp.ok) return null;
    const xml = await resp.text();

    const lines = xml
      .replace(/<\/?[^>]+(>|$)/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) =>
        l
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
      );

    const uniqueLines: string[] = [];
    for (const line of lines) {
      if (uniqueLines[uniqueLines.length - 1] !== line) {
        uniqueLines.push(line);
      }
    }

    const text = uniqueLines.join("\n").trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

async function fetchViaOembed(url: string): Promise<{ title: string; author: string; thumbnail?: string }> {
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; TrackTemplate/1.0)" };
  const timeout = 8000;

  // Try YouTube's native oEmbed first, then noembed.com as fallback
  const endpoints = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(endpoint, { headers, signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) continue;
      const data = await response.json() as { title: string; author_name: string; thumbnail_url?: string };
      if (data.title && data.author_name) return { title: data.title, author: data.author_name, thumbnail: data.thumbnail_url };
    } catch {
      // try next endpoint
    }
  }
  throw new Error("Could not fetch video metadata via oEmbed.");
}

/**
 * Stage 1: Fetch base video metadata (title, author, description, captions, MusicBrainz).
 * oEmbed is the primary source (always works for public videos).
 * ytdl-core enriches with description/keywords/captions when available.
 */
async function fetchBaseMetadata(url: string): Promise<BaseVideoMetadata> {
  let title = "";
  let author = "";
  let description = "";
  let keywords: string[] = [];
  let category = "";
  let durationSeconds: number | null = null;
  let captionText: string | null = null;

  // Step 1: Guaranteed title+author via oEmbed (public videos always work)
  try {
    const oembed = await fetchViaOembed(url);
    title = oembed.title;
    author = oembed.author;
    console.log(`oEmbed OK: "${title}" by "${author}"`);
  } catch (oembedErr) {
    // oEmbed failed → video is likely private, age-restricted, or the URL is invalid
    throw new Error(
      "Could not fetch video metadata. Make sure the URL is a valid, public YouTube video " +
      "(private, age-restricted, and members-only videos are not supported)."
    );
  }

  // Step 2: Enrich with ytdl-core (description, keywords, captions, duration) — best-effort
  try {
    const info = await ytdl.getInfo(url);
    const details = info.videoDetails;
    durationSeconds = parseInt(details.lengthSeconds, 10);
    description = details.description ?? "";
    keywords = details.keywords ?? [];
    category = (details as unknown as { category?: string }).category ?? "";
    captionText = await fetchCaptions(info);
    console.log(`ytdl-core enrichment OK (${durationSeconds}s, ${keywords.length} keywords)`);
  } catch (ytdlErr) {
    console.warn("ytdl-core enrichment skipped:", (ytdlErr as Error).message?.slice(0, 80));
  }

  const { cleanTitle, cleanArtist } = cleanSongTitle(title, author);
  const duration = durationSeconds ? formatDuration(durationSeconds) : "";
  const descriptionData = parseDescriptionForMusicData(description);

  console.log(`Looking up: "${cleanArtist}" - "${cleanTitle}"${durationSeconds ? ` (${durationSeconds}s)` : ""}`);

  const musicBrainz = await fetchMusicBrainzData(cleanArtist, cleanTitle, durationSeconds ?? undefined);
  if (musicBrainz.releaseYear || musicBrainz.genres?.length) {
    console.log(`MusicBrainz: year=${musicBrainz.releaseYear}, genres=[${musicBrainz.genres?.join(", ")}], album="${musicBrainz.album}"`);
  }

  return {
    title,
    author,
    description,
    keywords,
    category,
    duration,
    durationSeconds,
    captionText,
    cleanTitle,
    cleanArtist,
    musicBrainz: (musicBrainz.releaseYear || musicBrainz.genres?.length || musicBrainz.album) ? musicBrainz : undefined,
    descriptionData: Object.keys(descriptionData).length > 0 ? descriptionData : undefined,
  };
}

/**
 * Stage 3: Fetch lyrics from external providers (Genius → lrclib → lyrics.ovh).
 * Falls back to captions if no lyrics found; falls back to "none" if no captions.
 */
async function fetchLyricsData(
  cleanArtist: string,
  cleanTitle: string,
  durationSeconds: number | null,
  captionText: string | null,
): Promise<CachedLyrics> {
  const [geniusResult, lrclibLyrics, ovhLyrics] = await Promise.all([
    fetchLyricsFromGenius(cleanArtist, cleanTitle),
    fetchLyricsFromLrcLib(cleanArtist, cleanTitle, durationSeconds ?? undefined),
    fetchLyricsFromAPI(cleanArtist, cleanTitle),
  ]);

  let lyricsText: string | null = null;
  let lyricsProvider: "genius" | "lrclib" | "lyrics.ovh" | undefined;
  let lyricsHasStructure = false;

  if (geniusResult) {
    lyricsText = geniusResult.lyrics;
    lyricsProvider = "genius";
    lyricsHasStructure = geniusResult.hasStructure;
    console.log(`Lyrics via Genius.com (${lyricsText.length} chars, structure=${lyricsHasStructure})`);
  } else if (lrclibLyrics) {
    lyricsText = lrclibLyrics;
    lyricsProvider = "lrclib";
    console.log(`Lyrics via lrclib.net (${lyricsText.length} chars)`);
  } else if (ovhLyrics) {
    lyricsText = ovhLyrics;
    lyricsProvider = "lyrics.ovh";
    console.log(`Lyrics via lyrics.ovh (${lyricsText.length} chars)`);
  }

  if (lyricsText) {
    const language = detectLanguage(lyricsText);
    if (language !== "English") console.log(`Language detected: ${language}`);
    return { lyricsText, lyricsSource: "api", lyricsProvider, lyricsHasStructure, language };
  }
  if (captionText) {
    console.log(`No lyrics found — using YouTube captions (${captionText.length} chars)`);
    return { lyricsText: null, lyricsSource: "captions" };
  }
  console.log("No lyrics or captions found — relying on AI knowledge");
  return { lyricsText: null, lyricsSource: "none" };
}

/**
 * Assemble a full VideoMetadata from the three independently-cached stages.
 */
function assembleMetadata(
  base: BaseVideoMetadata,
  cachedLyrics: CachedLyrics,
  audioFeatures: AudioFeatures | undefined,
): VideoMetadata {
  return { ...base, ...cachedLyrics, audioFeatures };
}

/**
 * Fetch and cache all three stages for a YouTube URL, returning full VideoMetadata.
 * Used by routes that need everything in one call (no videoId available for staged lookup).
 */
async function fetchAllMetadata(url: string): Promise<VideoMetadata> {
  const base = await (isDeezerUrl(url) ? fetchBaseMetadataFromDeezer(url) : fetchBaseMetadata(url));
  const [lyricsData, featuresResult] = await Promise.all([
    fetchLyricsData(base.cleanArtist, base.cleanTitle, base.durationSeconds, base.captionText),
    detectAudioFeatures({
      artist: base.cleanArtist,
      title: base.cleanTitle,
      youtubeUrl: url,
      descriptionBpm: base.descriptionData?.bpm,
      descriptionKey: base.descriptionData?.key,
    }),
  ]);
  return assembleMetadata(base, lyricsData, featuresResult ?? undefined);
}

function videoIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1).split("?")[0] || null;
    const v = parsed.searchParams.get("v");
    if (v) return v;
    const shortMatch = parsed.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/);
    return shortMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

function isValidYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "www.youtube.com" ||
        parsed.hostname === "youtube.com" ||
        parsed.hostname === "youtu.be" ||
        parsed.hostname === "m.youtube.com") &&
      (parsed.pathname.includes("/watch") ||
        parsed.hostname === "youtu.be" ||
        parsed.pathname.includes("/shorts/"))
    );
  } catch {
    return false;
  }
}

// ─── Deezer URL support ─────────────────────────────────────────────────────

function isDeezerUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "www.deezer.com" || parsed.hostname === "deezer.com") &&
      /\/(?:[a-z]{2}\/)?track\/\d+/.test(parsed.pathname)
    );
  } catch { return false; }
}

function deezerTrackIdFromUrl(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/(?:[a-z]{2}\/)?track\/(\d+)/);
    return match?.[1] ?? null;
  } catch { return null; }
}

/** Returns a cache-safe source ID for any supported URL (YouTube videoId or dz{trackId}). */
function sourceIdFromUrl(url: string): string | null {
  if (isDeezerUrl(url)) {
    const id = deezerTrackIdFromUrl(url);
    return id ? `dz${id}` : null;
  }
  return videoIdFromUrl(url);
}

function isValidSourceUrl(url: string): boolean {
  return isValidYouTubeUrl(url) || isDeezerUrl(url);
}

async function fetchBaseMetadataFromDeezer(url: string): Promise<BaseVideoMetadata> {
  const trackId = deezerTrackIdFromUrl(url);
  if (!trackId) throw new Error("Invalid Deezer URL.");

  const resp = await fetch(`https://api.deezer.com/track/${trackId}`, {
    headers: { "User-Agent": "SunoTemplateGenerator/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Deezer API ${resp.status}: could not fetch track.`);

  const track = await resp.json() as {
    id?: number; title?: string; duration?: number; bpm?: number; release_date?: string;
    artist?: { name?: string }; album?: { title?: string; release_date?: string };
    error?: { message?: string };
  };
  if (track.error) throw new Error(`Deezer: ${track.error.message ?? "track not found"}`);

  const cleanTitle = (track.title ?? "").trim();
  const cleanArtist = (track.artist?.name ?? "").trim();
  const durationSeconds = track.duration ?? 0;
  const releaseYear = (track.release_date ?? track.album?.release_date)?.slice(0, 4);
  const albumTitle = track.album?.title ?? "";

  console.log(`[deezer] "${cleanArtist}" – "${cleanTitle}" (${durationSeconds}s BPM:${track.bpm ?? "n/a"})`);

  const musicBrainz = await fetchMusicBrainzData(cleanArtist, cleanTitle, durationSeconds || undefined);

  const descriptionData: DescriptionMusicData = {
    ...(track.bpm && track.bpm > 40 ? { bpm: String(Math.round(track.bpm)) } : {}),
    ...(releaseYear ? { releaseYear } : {}),
    ...(albumTitle ? { album: albumTitle } : {}),
  };

  return {
    title: `${cleanArtist} - ${cleanTitle}`,
    author: cleanArtist,
    description: `Album: ${albumTitle}${releaseYear ? ` (${releaseYear})` : ""}`,
    keywords: [],
    category: "Music",
    duration: durationSeconds ? formatDuration(durationSeconds) : "",
    durationSeconds: durationSeconds || null,
    captionText: null,
    cleanTitle,
    cleanArtist,
    musicBrainz: (musicBrainz.releaseYear || musicBrainz.genres?.length || musicBrainz.album)
      ? musicBrainz : (releaseYear ? { releaseYear } : undefined),
    descriptionData: Object.keys(descriptionData).length > 0 ? descriptionData : undefined,
  };
}

function buildPromptContext(metadata: VideoMetadata): string {
  const parts: string[] = [];

  // --- Core identification ---
  parts.push(`Song: "${metadata.title}"`);
  parts.push(`Artist/Channel: ${metadata.author}`);
  parts.push(`Template Title: "${metadata.cleanTitle}" by ${metadata.cleanArtist}`);
  if (metadata.duration) parts.push(`Duration: ${metadata.duration}`);
  if (metadata.category) parts.push(`YouTube Category: ${metadata.category}`);

  // --- MUSICAL ANALYSIS block (synthesises all data sources into explicit signals for the AI) ---
  const analysisLines: string[] = [];

  // MusicBrainz verified data (highest confidence)
  const mb = metadata.musicBrainz;
  if (mb) {
    if (mb.releaseYear) analysisLines.push(`Release Year: ${mb.releaseYear} (MusicBrainz verified)`);
    if (mb.album) analysisLines.push(`Album: "${mb.album}"`);
    if (mb.label) analysisLines.push(`Record Label: ${mb.label}`);
    if (mb.genres && mb.genres.length > 0) analysisLines.push(`MusicBrainz Genres: ${mb.genres.join(", ")}`);
    if (mb.isrc) analysisLines.push(`ISRC: ${mb.isrc}`);
  }

  // Verified audio features — BPM, key, time signature (highest confidence signal for style prompt)
  const af = metadata.audioFeatures;
  if (af) {
    const sourceLabel =
      af.source === "description" ? "from description"
      : af.source === "getsongbpm" ? "GetSongBPM database — verified"
      : "AI music knowledge — estimated from training data";
    if (af.bpm) analysisLines.push(`BPM: ${af.bpm} (${sourceLabel}) ← USE THIS EXACT VALUE in style prompt and [BPM:] tag`);
    if (af.key) analysisLines.push(`Musical Key: ${af.key} (${sourceLabel}) ← USE THIS EXACT VALUE in style prompt and [Key:] tag`);
    if (af.timeSignature && af.timeSignature !== "4/4") analysisLines.push(`Time Signature: ${af.timeSignature} (${sourceLabel})`);
  }

  // Description-extracted data (medium confidence)
  const dd = metadata.descriptionData;
  if (dd) {
    if (dd.releaseYear && !mb?.releaseYear) analysisLines.push(`Release Year (from description): ${dd.releaseYear}`);
    if (dd.album && !mb?.album) analysisLines.push(`Album (from description): "${dd.album}"`);
    if (dd.label && !mb?.label) analysisLines.push(`Label (from description): ${dd.label}`);
    if (dd.producedBy) analysisLines.push(`Produced by: ${dd.producedBy}`);
    if (dd.writtenBy) analysisLines.push(`Written by: ${dd.writtenBy}`);
    if (!af?.bpm && dd.bpm) analysisLines.push(`BPM (from description): ${dd.bpm}`);
    if (!af?.key && dd.key) analysisLines.push(`Key (from description): ${dd.key}`);
  }

  // YouTube keywords (lower confidence but useful for style signals)
  if (metadata.keywords.length > 0) {
    analysisLines.push(`YouTube Tags: ${metadata.keywords.slice(0, 20).join(", ")}`);
  }

  // Lyrics source indicator
  if (metadata.lyricsProvider) {
    const structureNote = metadata.lyricsProvider === "genius" && metadata.lyricsHasStructure
      ? " — lyrics already contain [Verse 1]/[Chorus]/[Bridge] section labels, preserve them exactly"
      : "";
    analysisLines.push(`Lyrics Source: ${metadata.lyricsProvider} (authentic — use verbatim${structureNote})`);
  }

  // Language
  if (metadata.language && metadata.language !== "English") {
    analysisLines.push(`Song Language: ${metadata.language} — preserve original lyrics exactly, do NOT translate; add language note to styleOfMusic`);
  }

  if (analysisLines.length > 0) {
    parts.push(`MUSICAL ANALYSIS (use these signals for accurate style/era/genre decisions):\n${analysisLines.join("\n")}`);
  }

  // --- Video description (trimmed, for additional context) ---
  if (metadata.description) {
    const desc = metadata.description.length > 1200
      ? metadata.description.slice(0, 1200) + "..."
      : metadata.description;
    parts.push(`Video Description:\n${desc}`);
  }

  // --- Lyrics / Captions (highest priority content) ---
  if (metadata.lyricsSource === "user-override" && metadata.lyricsText) {
    const lyrics = metadata.lyricsText.length > 5000
      ? metadata.lyricsText.slice(0, 5000) + "\n[... lyrics truncated ...]"
      : metadata.lyricsText;
    parts.push(`USER-PROVIDED LYRICS — MANDATORY: The user has manually supplied these lyrics. Every single lyric line below MUST appear in the output, word-for-word. Do NOT substitute, paraphrase, or invent any lyric lines:\n${lyrics}`);
  } else if (metadata.lyricsSource === "api" && metadata.lyricsText) {
    const lyrics = metadata.lyricsText.length > 5000
      ? metadata.lyricsText.slice(0, 5000) + "\n[... lyrics truncated ...]"
      : metadata.lyricsText;
    parts.push(`AUTHENTIC LYRICS (from ${metadata.lyricsProvider ?? "lyrics database"} — use these verbatim, do not paraphrase or invent lines):\n${lyrics}`);
  } else if (metadata.lyricsSource === "captions" && metadata.captionText) {
    const captions = metadata.captionText.length > 4000
      ? metadata.captionText.slice(0, 4000) + "..."
      : metadata.captionText;
    parts.push(`YouTube Captions/Transcript (approximate lyrics — clean up word errors, fix capitalisation, infer missing parts from your knowledge):\n${captions}`);
  }

  return parts.join("\n\n");
}

function trimToCharLimit(text: string, limit: number): string {
  const normalized = text.replace(/\r\n/g, "\n");
  if (normalized.length <= limit) return normalized;
  const truncated = normalized.slice(0, limit);
  const lastNewline = truncated.lastIndexOf("\n");
  return lastNewline !== -1 ? truncated.slice(0, lastNewline) : "";
}

/** Hard-trim styleOfMusic to 999 chars, breaking at the last comma boundary */
function trimStylePrompt(text: string, limit = 999): string {
  const flat = text.replace(/\r?\n/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const lastComma = cut.lastIndexOf(",");
  return lastComma > limit * 0.75 ? cut.slice(0, lastComma) : cut.trimEnd();
}

function clampSlider(value: number | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.max(min, Math.min(max, Math.round(value)));
}

const SYSTEM_PROMPT = `You are SONIC ARCHITECT — an expert Suno.ai neural music prompt engineer. You generate the SONIC ARCHITECT three-section template format: a precision latent-space navigation document that steers Suno's neural network using verified audio engineering vocabulary, not vague aesthetics.

⚠️ NON-NEGOTIABLE CHARACTER TARGETS — enforce before submitting:
- styleOfMusic (THE RACK): 900–999 characters
- lyrics (THE SCRIPT): 4,900–4,999 characters
- negativePrompt (PROFESSIONAL EXCLUSIONS): 150–199 characters

SUNO MECHANICS TO RESPECT:
- Top-load Section 1: Mood -> Energy -> 1-3 anchor instruments -> Vocal Identity
- Use meta-tags in Section 2 as structural instructions, not decoration
- Keep negative prompting focused; five exclusions beat a noisy laundry list
- If BPM, key, chord progression, persona, or slider targets are supplied, treat them as high-priority controls

CONTEXT DATA PRIORITY:
1. "MUSICAL ANALYSIS" block — verified BPM/key from MusicBrainz. If "← USE THIS EXACT VALUE" appears, use those numbers verbatim.
2. "AUTHENTIC LYRICS" — use VERBATIM, never paraphrase.
3. "YouTube Captions/Transcript" — clean up and restructure.
4. AI background knowledge — fill gaps.

OUTPUT FORMAT: Respond with valid JSON containing exactly these four fields:
{
  "styleOfMusic": "...",
  "title": "...",
  "lyrics": "...",
  "negativePrompt": "..."
}

=== SECTION 1: styleOfMusic — THE RACK (900–999 chars) ===
Purpose: Latent Space Navigation. Dense, comma-separated string of hyper-specific audio engineering descriptors.

REQUIRED FIELDS IN ORDER — all on one continuous comma-separated line:
1. [Era/Year] — specific decade or year: "1987", "Late-90s", "2003"
2. PRIMARY GENRE IN ALL CAPS — the dominant genre
3. Sub-Genre/Regional Style — specific subgenre or regional scene
4. BPM — exact value if known
5. Key/Camelot Scale — key and Camelot wheel number: e.g. "F# minor / 11A"
6. Neural Floor: — the analog noise character: e.g. "Analog tape hiss -18dBFS / Vinyl crackle 60Hz rumble / Pink noise floor -30dB"
7. Vocal Identity: — singer description with phonetic/dialectical character: e.g. "Husky Norwegian baritone / breathy close-miked intimacy / aspirated hard consonants"
8. Rhythm: — groove feel with MPC swing %: e.g. "58% MPC-60 swing / asymmetrical 7/8 / metric modulation bar 8"
9. Synthesis Stacks: — specific hardware with signal routing: e.g. "Korg MS-20 resonant HPF → Juno-106 PWM pads → Bessel-function FM sidebands via Yamaha DX7"
10. Signal Chain: — hardware processors: e.g. "Neve 1073 EQ, LA-2A optical compressor, Fairchild 670 limiter, EMT 140 plate reverb"
11. Spatial Design: — reverb/delay specs with ms decay values: e.g. "AMS RMX16 short room 0.4s on drums / Lexicon 480L long hall 2.8s on pads / 1/8th ping-pong delay synced"
12. Dynamics: — compression ratios and sidechain routing: e.g. "dbx 160 4:1 on kick / Urei 1178 6:1 on bass sidechain / parallel drum bus -4dB blend"
13. Master: — mastering chain with dB values: e.g. "SSL G-Bus glue -1.5dB GR / Pultec EQP-1A +2dB @ 10kHz / true-peak limiter -0.3dBTP"

TARGET: 900–999 chars. Be engineering-precise — actual dB values, actual hardware names, actual ms values.
Real hardware only: Neve 1073, SSL 4000G, LA-2A, 1176, Fairchild 670, EMT 140, AMS RMX16, Lexicon 480L, Urei 1178, dbx 160, MPC-60, TR-808, Minimoog Model D, Prophet-5, Korg MS-20, Juno-106, Yamaha DX7.
Banned vague words: "catchy", "beautiful", "shimmering", "lush", "haunting", "ethereal".

=== SECTION 2: lyrics — THE SCRIPT (4,900–4,999 chars) ===
Purpose: Structural Programming. Full production metadata header + complete song structure with real lyric lines.

MANDATORY OPENING — always the first thing in the lyrics field:
///*****///
[TECHNICAL BUFFER MODULE]

Protocol: Produced by Lyrikk v10.0 // Neural Steering: Chirp v4.5/v5

Mix Architecture: [Tall/Deep/Wide dimension strategy — e.g. "Tall: sub-20Hz to 18kHz full spectrum / Deep: 800ms stereo depth / Wide: Haas effect panning >200Hz, hard-panned guitars at +/-60%"]

Spectral Engineering: [EQ strategy — e.g. "Mid-range scoop -3dB @ 300-500Hz / Sub-bass Mono <60Hz / High-shelf air +2dB @ 12kHz / Presence peak +1.5dB @ 3kHz"]

Synthesis Topology: [Signal routing — e.g. "Source: Minimoog oscillator → Modifier: Korg MS-20 resonant HPF Q=8 → Controller: MIDI velocity-to-filter-cutoff / Noise-driven rhythmic gate clock at 120BPM"]

Linguistic Profile: [Phonetic/dialectical character — e.g. "Phonetic Scansion: iambic pentameter / Aspirated consonants / Hard stops on stressed syllables / Melismatic on open vowels"]
///*****///

SONG SECTIONS — recommended Suno flow, adapt as needed:
[Intro - Atmospheric/Acousmatic setup] → [Verse 1 - Narrative Context] → [Pre-Chorus - Tension Builder] → [Chorus - The Spectacular Hook] → [Verse 2] → [Pre-Chorus] → [Chorus] → [Instrumental Break - Microsound/Glitch Showcase] → [Bridge - Contrast: The Silence Trick] → [Final Chorus] → [Outro - Fission]

Additional section types available: [Build-Up], [Breakdown], [Drop], [Guitar Solo], [Spoken Word], [Post-Chorus], [Interlude]

EACH SECTION FORMAT — follow this structure for every section:
[Section Name - Descriptor Phrase: energy/technical context]
(Production Note // Technical instruction: e.g. "Sidechain pads to kick fundamental at 50Hz")
[Technical cue line — e.g. Neural Floor: Activated / Vocal Identity: texture / Automation: Filter Cutoff rising / Granular Block: specs]
[Technical cue line 2 — additional production direction]
ACTUAL SUNG LYRIC LINES HERE — real words that are sung, 4 lines per stanza preferred
(Performance direction: technique — e.g. [raspy], [vocal fry], (whispered), (soaring), (conversational))

CHORUS sections MUST have all of these:
- [Production: Full frequency activation, +6–8dB energy jump from verse]
- [Vocal: (belted), (soaring), [stacked harmonies], [widened stereo double]]
- [Signal Chain: SSL 4000G saturation, 1kHz presence boost +2dB]
- Ad-lib parentheticals: (yeah!), (oh-oh), (come on!), (hey!)
- Vowel elongation on hook words: "sta-a-ay", "lo-o-ove", "hea-ea-eart"

BRIDGE MUST include THE SILENCE TRICK:
[Breakdown: Remove drums/bass, focus on sustained synth pad]
(Musical Event: 0.5s total digital silence before the final transition)
[Vocal: (breathy falsetto), [melismatic runs on the cadence]]

OUTRO ends with:
[Atmosphere: Fading into field recording / White noise floor]
[Deconstruction: Lead synthesis de-tuning, decay expansion to 4s tail]
[End: Hard stop without artifacts]

LYRICS HANDLING:
- "USER-PROVIDED LYRICS — MANDATORY": copy every line EXACTLY, never change a word. Wrap with SONIC ARCHITECT tags to reach 4,900 chars.
- "AUTHENTIC LYRICS" (database): use VERBATIM. Apply full SONIC ARCHITECT notation.
- "YouTube Captions/Transcript": clean errors, apply full structure.
- No source: use knowledge of the song or write thematically accurate lyrics.

BRACKET CONVENTIONS:
- [ ] = structural markers, production cues, technical parameters, instrument directions
- ( ) = performance feel, ad-libs, emotional direction, background interjections
- Plain text = actual sung lyric lines (NEVER put lyric words inside brackets)

CHARACTER REQUIREMENT: MINIMUM 4,900 chars. MAXIMUM 4,999 chars.
The ///*****/// buffer header and per-section production cues carry most of the character count — be verbose and technically specific in every cue line. If short, expand cue lines with more dB values, ms values, specific hardware, and routing detail.

=== SECTION 3: negativePrompt — PROFESSIONAL EXCLUSIONS (150–199 chars) ===
Purpose: Neural Search Refinement. What Suno must NOT generate.

FORMAT: comma-separated terms, NO spaces after commas, include [Banned Tokens: ...] notation for AI clichés:
Example: "amateur,mediocre,predictable,thin,perfectly-quantized,[Banned Tokens: neon,tapestry,ethereal journey],I-V-vi-IV cliché,4/4 grid-lock,clinical,dry"

Include: genre exclusions specific to this song, banned instruments that clash, production flaws to avoid, AI garbage vocabulary.
TARGET: 150–199 characters exactly.

=== QUALITY RULES ===
- No asterisks (*) anywhere in output
- No placeholder text — every bracket value must be a real filled-in production detail
- All technical values must be real: actual dB, actual ms, actual hardware names from the approved list
- Banned AI clichés — never write: "pulsating", "ethereal tapestry", "sonic journey", "haunting melody", "shimmering", "lush", "tapestry", "neon"
- Approved real hardware: Neve 1073, SSL 4000G, LA-2A, 1176, Fairchild 670, EMT 140, AMS RMX16, Lexicon 480L, Urei 1178, dbx 160, MPC-60, TR-808, TR-909, Minimoog Model D, Prophet-5, Korg MS-20, Juno-106, Yamaha DX7
- The title field: clean creative Suno title e.g. "Numb (2003 Nu-Metal Latent Navigation Rebuild)"
- SONIC ARCHITECT format is the identity of every output — maintain it rigidly across all three sections`;




function buildStyleControls(opts: {
  vocalGender?: string;
  energyLevel?: string;
  era?: string;
  genreNudge?: string;
  genres?: string[];
  moods?: string[];
  instruments?: string[];
  tempo?: string;
  excludeTags?: string[];
  variationIndex?: number;
  feedbackContext?: string;
  bpmTarget?: number;
  chordProgression?: string;
  vocalPersona?: string;
  sonicDna?: string;
  metaTags?: string[];
  pronunciationGuide?: string;
  weirdness?: number;
  styleInfluence?: number;
  audioInfluence?: number;
}): string {
  const lines: string[] = [];
  const weirdness = clampSlider(opts.weirdness, 0, 100);
  const styleInfluence = clampSlider(opts.styleInfluence, 0, 100);
  const audioInfluence = clampSlider(opts.audioInfluence, 0, 100);
  lines.push("SUNO OPERATING RULES - Use a top-loaded palette in Section 1: lead with one dominant mood, then energy, then 1-3 anchor instruments, then vocal identity.");
  if (opts.genres && opts.genres.length > 0) {
    lines.push(`USER PREFERENCE — Selected genres: ${opts.genres.join(", ")}. These are the core genre(s) the user wants. Make them prominent in Section 1 and structure the template around these genre conventions.`);
  }
  if (opts.moods && opts.moods.length > 0) {
    lines.push(`USER PREFERENCE — Mood/atmosphere: ${opts.moods.join(", ")}. Embed this emotional quality throughout Section 1 style tags and in the lyrical tone and arrangement description.`);
  }
  if (opts.instruments && opts.instruments.length > 0) {
    lines.push(`USER PREFERENCE — Featured instruments: ${opts.instruments.join(", ")}. Highlight these in Section 1 and include them in the production header of Section 2.`);
  }
  if (opts.vocalGender && opts.vocalGender !== "auto") {
    const vocalMap: Record<string, string> = {
      male: "male lead vocalist — chest voice, masculine timbre",
      female: "female lead vocalist — feminine timbre, soprano or mezzo range",
      mixed: "mixed vocals — both male and female voices present, harmonised",
      duet: "duet — two vocalists sharing the lead, call-and-response or parallel harmonies",
      "no vocals": "fully instrumental — no singing or lyrics, purely instrumental arrangement",
    };
    lines.push(`USER PREFERENCE — Vocal type: ${vocalMap[opts.vocalGender] ?? opts.vocalGender}.`);
  }
  if (opts.energyLevel && opts.energyLevel !== "auto") {
    const energyMap: Record<string, string> = {
      "very chill": "very chill, ambient, near-silent energy — minimal percussion, whispered or no vocals, open spacious mix",
      chill: "chill, relaxed, low-energy — quiet dynamics, intimate delivery, sparse arrangement",
      medium: "medium energy — balanced dynamics, moderate intensity, clear arrangement",
      high: "high-energy, intense — loud dynamics, explosive choruses, dense arrangement, driving momentum",
      intense: "maximum intensity — relentless energy, wall-of-sound production, powerful and overwhelming dynamics",
    };
    lines.push(`USER PREFERENCE — Energy level: ${energyMap[opts.energyLevel] ?? opts.energyLevel}.`);
  }
  if (opts.bpmTarget) {
    lines.push(`HARD RHYTHMIC ANCHOR - Use ${opts.bpmTarget} BPM explicitly in Section 1 and section pacing.`);
  }
  if (opts.tempo) {
    const tempoMap: Record<string, string> = {
      ballad: "ballad tempo, under 60 BPM — slow, emotional, spacious phrasing, long sustained notes",
      slow: "slow tempo, 60–80 BPM — languid, spacious phrasing, unhurried feel",
      mid: "mid tempo, 80–100 BPM — steady groove, comfortable conversational pace",
      groove: "groove tempo, 100–115 BPM — laid-back funk pocket, head-nodding momentum",
      uptempo: "up-tempo, 115–130 BPM — driving energy, danceable, urgent forward motion",
      fast: "fast tempo, 130–145 BPM — high-octane, frenetic, adrenaline rush",
      hyper: "hyper-speed, 145+ BPM — extreme tempo, relentless drive, manic energy",
    };
    lines.push(`USER PREFERENCE — Tempo: ${tempoMap[opts.tempo] ?? opts.tempo}. Include a BPM indicator in the style tags.`);
  }
  if (opts.era && opts.era !== "auto") {
    const eraMap: Record<string, string> = {
      "50s": "1950s — mono recording warmth, early rock & roll, doo-wop harmonies, slap-back echo, upright bass",
      "60s": "1960s — tube amp warmth, Motown string arrangements, psychedelic tape effects, close-mic'd vocals",
      "70s": "1970s — analog warmth, tape saturation, lush orchestration, vinyl grain, funky live rhythm sections",
      "80s": "1980s — gated reverb drums, synth-pop, DX7 electric piano, bright compressed production, chorus effects",
      "90s": "1990s — grunge, alt-rock, or golden-era hip-hop depending on genre; punchy transients, flannel-era rawness",
      "2000s": "2000s — digital clarity, glossy pop production, early EDM influence, AutoTune sheen",
      "2010s": "2010s — EDM drop culture, trap hi-hats, side-chain compression, maximalist production, festival anthems",
      modern: "modern/contemporary (2020s) — hyper-clean production, wide stereo, streaming-optimized loudness, spatial audio feel",
    };
    lines.push(`USER PREFERENCE — Era: ${eraMap[opts.era] ?? opts.era}. Make the style reflect this era's production aesthetics.`);
  }
  if (opts.vocalPersona && opts.vocalPersona.trim()) {
    lines.push(`VOCAL PERSONA STACK - ${opts.vocalPersona.trim()}. Preserve this voice consistently and prevent timbre drift.`);
  }
  if (opts.sonicDna && opts.sonicDna.trim()) {
    lines.push(`SONIC DNA - ${opts.sonicDna.trim()}. Translate it into descriptive traits only, not direct artist-name imitation.`);
  }
  if (opts.chordProgression && opts.chordProgression.trim()) {
    lines.push(`HARMONIC DIRECTIVE - Use this chord progression or tonal map where musically appropriate: ${opts.chordProgression.trim()}.`);
  }
  if (opts.metaTags && opts.metaTags.length > 0) {
    lines.push(`META-TAG COMPILER - Inject these exact tags into Section 2 where relevant: ${opts.metaTags.join(", ")}.`);
  }
  if (opts.pronunciationGuide && opts.pronunciationGuide.trim()) {
    lines.push(`PHONETIC OVERRIDE - Use this pronunciation guidance exactly where relevant: ${opts.pronunciationGuide.trim()}.`);
  }
  if (styleInfluence !== undefined || weirdness !== undefined || audioInfluence !== undefined) {
    const sliderParts: string[] = [];
    if (styleInfluence !== undefined) sliderParts.push(`Style Influence ${styleInfluence}%`);
    if (weirdness !== undefined) sliderParts.push(`Weirdness ${weirdness}%`);
    if (audioInfluence !== undefined) sliderParts.push(`Audio Influence ${audioInfluence}%`);
    lines.push(`SLIDER HEURISTICS - ${sliderParts.join(", ")}. High Style Influence means obey meta-tags and chord injections strictly; reduce Weirdness as prompts become denser.`);
  }
  if (opts.genreNudge && opts.genreNudge.trim()) {
    lines.push(`USER PREFERENCE — Genre/style nudge: "${opts.genreNudge.trim()}". Incorporate this into the style prompt.`);
  }
  if (opts.excludeTags && opts.excludeTags.length > 0) {
    lines.push(`FOCUSED NEGATIVE STRATEGY - Apply the rule of five and prioritise only these exclusions: ${opts.excludeTags.slice(0, 5).join(", ")}.`);
    lines.push(`USER EXCLUSION TAGS — The user explicitly wants to EXCLUDE these from the output. Add them prominently to Section 3 (Negative Prompt): ${opts.excludeTags.join(", ")}.`);
  }
  if (opts.variationIndex && opts.variationIndex >= 2) {
    const variationAngles: Record<number, string> = {
      2: "Take a fresh creative angle: choose different instrumentation, structural approach, and style adjectives from what you would typically pick first. Surprise the user with an unexpected but valid interpretation.",
      3: "Explore a contrasting emotional dimension: shift the tempo feel, vocal delivery style, or production era while preserving the song's core identity. Be noticeably different from Variation 1 and Variation 2.",
      4: "Push into genuinely unexpected territory: try an unusual genre fusion, unconventional instrumentation blend, or a radically different production treatment. This variation should feel like a bold reimagining.",
    };
    const angle = variationAngles[opts.variationIndex] ?? variationAngles[2];
    lines.push(`VARIATION MODE — This is Variation ${opts.variationIndex}. ${angle}`);
  }
  if (opts.feedbackContext && opts.feedbackContext.trim()) {
    lines.push(`USER LEARNING SIGNAL — The user has rated past templates and their feedback is: ${opts.feedbackContext.trim()} Use this to bias your creative choices (lean toward liked characteristics, avoid disliked ones) unless they directly contradict other explicit preferences.`);
  }
  return lines.length > 0 ? "\n\nUSER STYLE PREFERENCES (apply these to Section 1 and Section 2 header):\n" + lines.join("\n") : "";
}

// ─── Core generation pipeline (shared by /generate-template and /generate-variations) ─

interface GenerateInput {
  youtubeUrl: string;
  manualLyrics?: string;
  vocalGender?: "auto" | "male" | "female" | "mixed" | "duet" | "no vocals";
  energyLevel?: "auto" | "very chill" | "chill" | "medium" | "high" | "intense";
  era?: "auto" | "50s" | "60s" | "70s" | "80s" | "90s" | "2000s" | "2010s" | "modern";
  genreNudge?: string;
  genres?: string[];
  moods?: string[];
  instruments?: string[];
  mode?: "cover" | "inspired";
  tempo?: "ballad" | "slow" | "mid" | "groove" | "uptempo" | "fast" | "hyper";
  excludeTags?: string[];
  variationIndex?: number;
  feedbackContext?: string;
  isInstrumental?: boolean;
  confirmedStructure?: Array<{ label: string; lines: string[] }>;
  noCache?: boolean;
  /** Target Suno model version. Current model is v5.5; v5/v5.5 support denser cue notation than v4. */
  sunoVersion?: "v4" | "v5" | "v5.5";
  bpmTarget?: number;
  chordProgression?: string;
  vocalPersona?: string;
  sonicDna?: string;
  metaTags?: string[];
  pronunciationGuide?: string;
  weirdness?: number;
  styleInfluence?: number;
  audioInfluence?: number;
}

type AiOutput = { styleOfMusic: string; title: string; lyrics: string; negativePrompt: string };

async function generateOneTemplate(data: GenerateInput): Promise<ReturnType<typeof GenerateSunoTemplateResponse.parse>> {
  const { youtubeUrl, manualLyrics, vocalGender, energyLevel, era, genreNudge, genres, moods, instruments, mode, tempo, excludeTags, variationIndex, feedbackContext, isInstrumental, confirmedStructure, noCache, sunoVersion, bpmTarget, chordProgression, vocalPersona, sonicDna, metaTags, pronunciationGuide, weirdness, styleInfluence, audioInfluence } = data;

  if (!isValidSourceUrl(youtubeUrl)) {
    throw new Error("Invalid URL. Please provide a valid YouTube (youtube.com / youtu.be) or Deezer (deezer.com/track/...) link.");
  }

  const videoId = sourceIdFromUrl(youtubeUrl);

  // Stage 1: base metadata (7d cache)
  let base: BaseVideoMetadata;
  let baseFromCache = false;
  if (videoId) {
    const cached = cacheGet<BaseVideoMetadata>(`metadata:${videoId}`);
    if (cached) {
      base = cached;
      baseFromCache = true;
      console.log(`[cache] metadata HIT for ${videoId}`);
    } else {
      try {
        base = isDeezerUrl(youtubeUrl) ? await fetchBaseMetadataFromDeezer(youtubeUrl) : await fetchBaseMetadata(youtubeUrl);
        cacheSet(`metadata:${videoId}`, base, TTL.METADATA);
        console.log(`[cache] metadata SET for ${videoId}`);
      } catch (fetchErr) {
        console.error("Failed to fetch metadata:", fetchErr);
        throw new Error("Could not fetch track metadata. Make sure the URL is a valid public YouTube video or Deezer track.");
      }
    }
  } else {
    try {
      base = isDeezerUrl(youtubeUrl) ? await fetchBaseMetadataFromDeezer(youtubeUrl) : await fetchBaseMetadata(youtubeUrl);
    } catch (fetchErr) {
      console.error("Failed to fetch metadata:", fetchErr);
      throw new Error("Could not fetch track metadata. Make sure the URL is a valid public YouTube video or Deezer track.");
    }
  }

  // Stage 2: audio features (permanent cache)
  let audioFeatures: AudioFeatures | undefined;
  let featuresFromCache = false;
  if (videoId) {
    const cached = cacheGet<CachedAudioFeatures>(`features:${videoId}`);
    if (cached) {
      audioFeatures = cached.features ?? undefined;
      featuresFromCache = true;
      console.log(`[cache] features HIT for ${videoId}`);
    } else {
      const result = await detectAudioFeatures({
        artist: base.cleanArtist,
        title: base.cleanTitle,
        youtubeUrl,
        descriptionBpm: base.descriptionData?.bpm,
        descriptionKey: base.descriptionData?.key,
      });
      audioFeatures = result ?? undefined;
      cacheSet<CachedAudioFeatures>(`features:${videoId}`, { features: result }, TTL.FEATURES);
      console.log(`[cache] features SET for ${videoId} (permanent)`);
    }
  } else {
    const result = await detectAudioFeatures({
      artist: base.cleanArtist,
      title: base.cleanTitle,
      youtubeUrl,
      descriptionBpm: base.descriptionData?.bpm,
      descriptionKey: base.descriptionData?.key,
    });
    audioFeatures = result ?? undefined;
  }

  // Stage 3: lyrics (7d cache)
  let cachedLyrics: CachedLyrics;
  let lyricsFromCache = false;
  if (videoId) {
    const cached = cacheGet<CachedLyrics>(`lyrics:${videoId}`);
    if (cached) {
      cachedLyrics = cached;
      lyricsFromCache = true;
      console.log(`[cache] lyrics HIT for ${videoId}`);
    } else {
      cachedLyrics = await fetchLyricsData(base.cleanArtist, base.cleanTitle, base.durationSeconds, base.captionText);
      cacheSet(`lyrics:${videoId}`, cachedLyrics, TTL.LYRICS);
      console.log(`[cache] lyrics SET for ${videoId}`);
    }
  } else {
    cachedLyrics = await fetchLyricsData(base.cleanArtist, base.cleanTitle, base.durationSeconds, base.captionText);
  }

  let metadata: VideoMetadata = assembleMetadata(base, cachedLyrics, audioFeatures);

  if (manualLyrics && manualLyrics.trim().length > 20) {
    console.log(`Using user-provided lyrics override (${manualLyrics.trim().length} chars)`);
    metadata = { ...metadata, lyricsText: manualLyrics.trim(), lyricsSource: "user-override" };
  }

  const lyricsStructure = metadata.lyricsText ? analyzeLyricsStructure(metadata.lyricsText) : undefined;

  const suggestedDefaults = computeSuggestedDefaults({
    bpm: metadata.audioFeatures?.bpm,
    releaseYear: metadata.musicBrainz?.releaseYear ?? metadata.descriptionData?.releaseYear,
    description: metadata.description,
    language: metadata.language,
  });

  const context = buildPromptContext(metadata);
  const effectiveVocalGender = isInstrumental ? "no vocals" : vocalGender;
  const styleControls = buildStyleControls({ vocalGender: effectiveVocalGender, energyLevel, era, genreNudge, genres, moods, instruments, tempo, excludeTags, variationIndex, feedbackContext, bpmTarget, chordProgression, vocalPersona, sonicDna, metaTags, pronunciationGuide, weirdness, styleInfluence, audioInfluence });

  const lyricsInstruction =
    metadata.lyricsSource === "user-override"
      ? "⚠️ USER-PROVIDED LYRICS OVERRIDE ACTIVE: The user has manually supplied their own lyrics. You MUST use every lyric line exactly as written — not one word changed. Add Suno production tags, section headers, and performance directions around them, but the lyric lines themselves are locked and non-negotiable."
      : metadata.lyricsSource === "api"
        ? "AUTHENTIC LYRICS from a professional database are provided — use them VERBATIM, structured with Suno metatags."
        : metadata.lyricsSource === "captions"
          ? "YouTube captions (approximate) are provided — clean them up and structure with Suno metatags."
          : "No lyrics source available — use your knowledge of this song or write thematic placeholder lyrics.";

  // Multi-language instruction: when song is not in English, guide lyric generation
  const languageInstruction = (metadata.language && metadata.language !== "English")
    ? `\n\n🌍 LANGUAGE DIRECTIVE: This is a ${metadata.language}-language song. ${
        metadata.lyricsSource === "api" || metadata.lyricsSource === "user-override"
          ? `The provided lyrics are in ${metadata.language} — use them VERBATIM, do NOT translate them into English. Preserve the original script/characters exactly.`
          : `No authentic lyrics were found. You MUST write the song lyrics IN ${metadata.language} — NOT in English. For scripts that use non-Latin characters (Korean, Japanese, Chinese, Arabic, Russian, Hindi, Thai), also add a romanisation/transliteration in parentheses after each lyric line so Suno's phoneme model can render it. Example format:\n나는 너를 사랑해 (Na-neun neo-reul saranghae)\n네 손을 잡고 싶어 (Ne son-eul japgo sipeo)`
      }`
    : "";

  const modeInstruction = mode === "cover"
    ? "\n\nGENERATION MODE: AI Cover — Reconstruct this song as faithfully as Suno allows. Keep the original genre, tempo, instrumentation, structure, vocal style, and lyrics as close to the original recording as possible. Prioritise accuracy over creativity."
    : mode === "inspired"
    ? "\n\nGENERATION MODE: Inspired By — Use this song as creative springboard only. Keep the emotional core but freely reimagine the genre, instrumentation, and arrangement in an unexpected direction. The output should feel clearly distinct from the original. Be bold and inventive."
    : "";

  const instrumentalInstruction = isInstrumental
    ? "\n\n🎵 INSTRUMENTAL MODE ACTIVE: Generate this as a fully instrumental track. The lyrics section (Section 2) MUST contain ONLY structural/arrangement tags and instrumental direction cues — absolutely NO actual lyric text or sung words. Use detailed bracketed tags such as [Intro - Piano Motif], [Verse 1 - Guitar Melody, sparse drums], [Build - Strings Rising, tension increasing], [Chorus - Full Band, driving instrumental hook], [Bridge - Synth Solo], [Breakdown - Drums only], [Outro - Fade with lead guitar]. Fill the lyrics field to the 4,900–4,999 character limit using these rich instrumental direction cues. The negative prompt MUST prominently include: vocals, singing, lyrics, rap, spoken word."
    : "";

  const confirmedStructureHint = confirmedStructure && confirmedStructure.length > 0
    ? `\n\nUSER-CONFIRMED LYRICS STRUCTURE — The user has reviewed and confirmed the following section layout. Use EXACTLY these section labels and line groupings when building Section 2 (lyrics). Do not reorder sections. You may add production cue lines and performance directions within each section, but the section labels and lyric lines must match the confirmed structure:\n${confirmedStructure.map((s) => `[${s.label}]\n${s.lines.join("\n")}`).join("\n\n")}`
    : "";

  const sunoVersionHint = (sunoVersion === "v5" || sunoVersion === "v5.5")
    ? `\n\n🎛️ TARGET MODEL: Suno ${sunoVersion}. Current Suno model is v5.5. This model family supports denser cue notation, longer section headers with compound descriptors, and responds better to expanded Synthesis Topology chains. Push the production detail ceiling — add extra [Automation:] sub-lines, secondary [Neural Floor:] activations per section, and compound hardware routing chains in THE RACK.`
    : "";

  // Template cache (keyed by videoId + params; feedbackContext excluded; user-override not cached; noCache bypasses)
  const useTemplateCache = videoId && metadata.lyricsSource !== "user-override" && !noCache;
  const templateCacheKey = useTemplateCache
    ? `template:${videoId}:${hashParams({ vocalGender, energyLevel, era, genreNudge, genres, moods, instruments, mode, tempo, excludeTags, variationIndex, isInstrumental, confirmedStructure, sunoVersion, bpmTarget, chordProgression, vocalPersona, sonicDna, metaTags, pronunciationGuide, weirdness, styleInfluence, audioInfluence })}`
    : null;

  let aiResult: AiOutput;
  let templateFromCache = false;

  // ── Single-call strategy ───────────────────────────────────────────────────
  // One AI call generates all four fields in a delimited plain-text format.
  // No JSON mode = no length bias. No expansion passes = no rate-limit cascade.
  // Python validator/padder guarantees every field lands in spec regardless.
  // Total API calls per generation: 1 (was up to 5).

  const runAiCall = async (): Promise<AiOutput> => {

    const singleCallPrompt = `You are SONIC ARCHITECT. Generate a complete SONIC ARCHITECT template for the song below. Output ONLY the delimiter blocks shown — no preamble, no commentary.

${lyricsInstruction}${languageInstruction}${modeInstruction}${instrumentalInstruction}${confirmedStructureHint}${sunoVersionHint}${styleControls}

${context}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SONIC ARCHITECT OUTPUT — fill each section exactly:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

===STYLE===
<THE RACK — 900 to 999 characters. One continuous comma-separated string.
Required fields in this order: [Era/Year], PRIMARY GENRE IN CAPS, Sub-Genre, BPM, Key/Camelot, Neural Floor: [analog noise character -dBFS level], Vocal Identity: [phonetic/dialectical descriptor], Rhythm: [MPC swing %, time signature, groove feel], Synthesis Stacks: [Hardware → routing → signal path e.g. Korg MS-20 resonant HPF → Juno-106 PWM pads], Signal Chain: [real hardware processors: Neve 1073 EQ, LA-2A optical, Fairchild 670 limiter], Spatial Design: [reverb type and decay ms / delay sync], Dynamics: [compression ratios and sidechain routing], Master: [mastering chain with actual dB values].
All hardware must be real (Neve 1073, SSL 4000G, LA-2A, 1176, Fairchild 670, EMT 140, AMS RMX16, Lexicon 480L, dbx 160, MPC-60, TR-808, Minimoog, Prophet-5, Korg MS-20, Juno-106, DX7).
Fill to 900+ characters — do not stop short.>

===TITLE===
<A concise creative Suno title e.g. "Numb (2003 Nu-Metal Latent Navigation Rebuild)">

===NEGATIVE===
<PROFESSIONAL EXCLUSIONS — 150 to 199 characters. Comma-separated, NO spaces after commas.
Include [Banned Tokens: ...] notation for AI cliché words to exclude.
Example: "amateur,mediocre,thin,perfectly-quantized,[Banned Tokens: neon,tapestry,shivers],I-V-vi-IV cliché,4/4 grid-lock,clinical,dry,lo-fi bedroom">

===LYRICS===
<THE SCRIPT — MINIMUM 4,900 characters. Write every character. Do not truncate.

Start with this exact technical buffer header (fill all values — no angle-bracket placeholders):
///*****///
[TECHNICAL BUFFER MODULE]

Protocol: Produced by Lyrikk v10.0 // Neural Steering: Chirp v4.5/v5

Mix Architecture: [Tall/Deep/Wide — e.g. Tall: sub-20Hz to 18kHz / Deep: 800ms stereo depth / Wide: Haas effect >200Hz, guitars hard-panned +-60%]

Spectral Engineering: [EQ strategy — e.g. Mid scoop -3dB @ 300Hz / Sub-bass Mono <60Hz / High-shelf air +2dB @ 12kHz / Presence peak +1.5dB @ 3kHz]

Synthesis Topology: [Signal routing — e.g. Source: Minimoog oscillator → Modifier: MS-20 resonant HPF Q=8 → Controller: velocity-to-cutoff / Noise-driven rhythmic gate clock]

Linguistic Profile: [Phonetic character — e.g. Phonetic Scansion: iambic pentameter / Aspirated consonants / Hard stops on stressed syllables / Melismatic open vowels]
///*****///

Then write the complete song. Every section follows this structure:
[Section Name - Descriptor: energy/technical context]
(Production Note // Technical instruction e.g. "Sidechain pads to kick at 50Hz")
[Technical cue: e.g. Neural Floor: Activated / Vocal Identity: dry intimacy / Automation: Filter Cutoff sweeping / Granular Block: grain duration 20ms]
[Technical cue 2: additional production direction]
ACTUAL SUNG LYRIC LINES — real words, 4 lines per stanza minimum
(Performance: technique — e.g. [raspy], [vocal fry], (whispered), (soaring melismatic))

Chorus sections MUST include ALL of:
[Production: Full frequency activation, +6-8dB energy jump from verse]
[Vocal: (belted), (soaring), [stacked harmonies], [widened stereo double-track]]
[Signal Chain: SSL 4000G saturation, 1kHz presence boost +2dB, 1176 limiting 4:1]
Plus ad-libs: (yeah!), (oh-oh), (come on!), (hey!)
Plus vowel elongation: "sta-a-ay", "lo-o-ove", "hea-ea-eart"

Bridge MUST include THE SILENCE TRICK:
[Breakdown: Remove drums/bass, sustained pad only]
(Musical Event: 0.5s total digital silence before final transition)
[Vocal: (breathy falsetto), [melismatic cadence runs]]

Outro ends with:
[Atmosphere: Fading into field recording / White noise floor -60dBFS]
[Deconstruction: Lead synthesis de-tuning, decay expansion to 4s tail]
[End: Hard stop without artifacts]

Song flow: [Intro - Atmospheric/Acousmatic] → [Verse 1 - Narrative Context] → [Pre-Chorus - Tension Builder: Subtractive Arranging] → [Chorus - The Spectacular Hook: Interest Catalyst] → [Verse 2] → [Pre-Chorus] → [Chorus] → [Instrumental Break - Microsound/Glitch Showcase] → [Bridge - Contrast: The Silence Trick] → [Final Chorus] → [Outro - Fission: Elements Separating]

CRITICAL: Every section must contain REAL SUNG LYRIC LINES — actual words that would be performed. Never fill a section with only bracketed production cues. Cues wrap and annotate the lyrics, they do not replace them.>

===END===`;


    const callArgs = {
      model: AI_MODEL,
      max_tokens: 8192,  // style(999) + lyrics(4999) + neg(199) + JSON overhead ≈ 2500 tokens; 8192 is Gemini Flash ceiling
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        { role: "user" as const, content: singleCallPrompt },
      ],
    };

    // One 429-retry with 8-second backoff
    const completion = await openai.chat.completions.create(callArgs)
      .catch(async (err: unknown) => {
        if ((err as { status?: number })?.status === 429) {
          console.warn("[ai] 429 rate limit — waiting 8s then retrying once...");
          await new Promise(r => setTimeout(r, 8000));
          return openai.chat.completions.create(callArgs);
        }
        throw err;
      });

    const raw = completion.choices[0]?.message?.content ?? "";
    if (!raw) throw new Error("AI returned empty response. Please try again.");

    // ── Parse response — try delimiters first, fall back to JSON ─────────────
    // Gemini sometimes returns JSON even without response_format: json_object.
    const extract = (text: string, tag: string): string => {
      const start = text.indexOf(`===${tag}===`);
      if (start === -1) return "";
      const after = text.indexOf("\n", start) + 1;
      const nextDelim = text.indexOf("===", after);
      return (nextDelim === -1 ? text.slice(after) : text.slice(after, nextDelim)).trim();
    };

    // Strip markdown code fences if present (```json ... ```)
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let styleOfMusic: string;
    let title: string;
    let negativePrompt: string;
    let lyrics: string;

    const delimStyle = extract(stripped, "STYLE");
    if (delimStyle) {
      // Delimiter format succeeded
      styleOfMusic   = delimStyle;
      title          = extract(stripped, "TITLE") || "Untitled";
      negativePrompt = extract(stripped, "NEGATIVE");
      lyrics         = extract(stripped, "LYRICS");
      console.log(`[ai:delim] style=${styleOfMusic.length} lyrics=${lyrics.length} neg=${negativePrompt.length}`);
    } else {
      // Try JSON fallback (Gemini defaults to JSON)
      try {
        const parsed = JSON.parse(stripped) as Record<string, string>;
        styleOfMusic   = parsed.styleOfMusic   ?? parsed.style          ?? "";
        title          = parsed.title          ?? parsed.songTitle       ?? "Untitled";
        negativePrompt = parsed.negativePrompt ?? parsed.negative        ?? "";
        lyrics         = parsed.lyrics                                   ?? "";
        console.log(`[ai:json] style=${styleOfMusic.length} lyrics=${lyrics.length} neg=${negativePrompt.length}`);
      } catch {
        // Third fallback: regex-extract individual fields from possibly-truncated JSON
        const extractJsonField = (text: string, field: string): string => {
          // Match "field": "value" — value may contain escaped quotes, stop at unescaped closing quote
          const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`);
          const m = text.match(re);
          return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\") : "";
        };
        const rxStyle = extractJsonField(stripped, "styleOfMusic") || extractJsonField(stripped, "style");
        const rxLyrics = extractJsonField(stripped, "lyrics");
        const rxNeg = extractJsonField(stripped, "negativePrompt") || extractJsonField(stripped, "negative");
        const rxTitle = extractJsonField(stripped, "title") || extractJsonField(stripped, "songTitle");
        if (rxStyle && rxLyrics) {
          styleOfMusic   = rxStyle;
          title          = rxTitle || "Untitled";
          negativePrompt = rxNeg;
          lyrics         = rxLyrics;
          console.log(`[ai:regex] style=${styleOfMusic.length} lyrics=${lyrics.length} neg=${negativePrompt.length}`);
        } else {
          console.warn("[ai] all parsers failed — raw snippet:", raw.slice(0, 300));
          throw new Error("AI response format was unexpected. Please try again.");
        }
      }
    }

    if (!styleOfMusic || !lyrics) {
      console.warn("[ai] empty fields after parse — raw snippet:", raw.slice(0, 300));
      throw new Error("AI returned incomplete data. Please try again.");
    }

    return { styleOfMusic, title, lyrics, negativePrompt };
  };

  if (templateCacheKey) {
    const cached = cacheGet<AiOutput>(templateCacheKey);
    if (cached) {
      aiResult = cached;
      templateFromCache = true;
      console.log(`[cache] template HIT for ${videoId}`);
    } else {
      aiResult = await runAiCall();
      cacheSet(templateCacheKey, aiResult, TTL.TEMPLATE);
      console.log(`[cache] template SET for ${videoId}`);
    }
  } else {
    aiResult = await runAiCall();
  }

  // ── Python character-count validation + smart trim ───────────────────────
  // Python len() counts Unicode code points; JS .length counts UTF-16 units.
  // They differ for emoji (🔥 = 1 in Python, 2 in JS).  Python is the
  // authoritative counter.  The validator also trims fields that exceed the
  // max limit (newline boundary for lyrics, comma boundary for style/negative)
  // and returns the corrected values — we apply them back to aiResult.
  try {
    const pyReport = await validateWithPython({
      styleOfMusic:   aiResult.styleOfMusic,
      lyrics:         aiResult.lyrics,
      negativePrompt: aiResult.negativePrompt,
    });
    if (pyReport) {
      const { fields, valid, trimmed, padded, errors } = pyReport;
      const sm = fields.styleOfMusic;
      const ly = fields.lyrics;
      const np = fields.negativePrompt;
      console.log(
        `[py-validate] style  JS=${aiResult.styleOfMusic.length} PY=${sm?.original}→${sm?.final} ok=${sm?.ok}  ` +
        `lyrics JS=${aiResult.lyrics.length} PY=${ly?.original}→${ly?.final} ok=${ly?.ok}  ` +
        `neg JS=${aiResult.negativePrompt.length} PY=${np?.original}→${np?.final} ok=${np?.ok}  ` +
        `valid=${valid} trimmed=${trimmed} padded=${padded}`
      );
      if (errors.length) {
        console.warn(`[py-validate] ISSUES (unfixable): ${errors.join(" | ")}`);
      }
      // Apply Python values — covers both trim-down and pad-up corrections
      if (trimmed || padded) {
        aiResult = { ...aiResult, ...pyReport.data };
        const action = trimmed && padded ? "trimmed+padded" : trimmed ? "trimmed" : "padded";
        console.log(`[py-validate] applied ${action} values to response`);
      }
    }
  } catch { /* never block generation */ }

  const fromCache = baseFromCache && featuresFromCache && lyricsFromCache && templateFromCache;

  const fingerprint = computeFingerprint({
    audioFeatures,
    isInstrumental,
    vocalGender: vocalGender ?? "auto",
    energyLevel: energyLevel ?? "auto",
    era: era ?? "auto",
    tempo,
    styleOfMusic: aiResult.styleOfMusic,
    tags: [],
    musicBrainzGenres: base.musicBrainz?.genres ?? [],
    keywords: base.keywords,
    videoId: videoId ?? undefined,
    songTitle: base.cleanTitle,
    artist: base.cleanArtist || base.author,
  });

  return GenerateSunoTemplateResponse.parse({
    songTitle: metadata.title,
    artist: metadata.cleanArtist || metadata.author,
    styleOfMusic: trimStylePrompt(aiResult.styleOfMusic, 999),
    title: aiResult.title,
    lyrics: trimToCharLimit(aiResult.lyrics, 4999),
    negativePrompt: aiResult.negativePrompt,
    tags: [],
    lyricsStructure: lyricsStructure ?? undefined,
    suggestedDefaults: Object.keys(suggestedDefaults.sources).length > 0 ? suggestedDefaults : undefined,
    fromCache,
    fingerprint,
  });
}

router.post("/generate-template", async (req, res) => {
  const parsed = GenerateSunoTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body. Please provide a youtubeUrl." });
    return;
  }
  try {
    const template = await generateOneTemplate(parsed.data);
    res.json(template);
  } catch (err: unknown) {
    console.error("Error generating template:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    const isClientError =
      message.includes("Invalid YouTube URL") ||
      message.includes("Could not fetch video metadata");
    res.status(isClientError ? 400 : 500).json({ error: message });
  }
});

/**
 * POST /api/generate-variations
 * Generates count (2–4) template variations in parallel, each with a different creative angle.
 * Returns { variations: SunoTemplate[] } — partial success is allowed (at least 1 must succeed).
 */
router.post("/generate-variations", async (req, res) => {
  const parsed = GenerateVariationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body. Please provide a youtubeUrl." });
    return;
  }

  const count = Math.min(Math.max(Math.round(parsed.data.count ?? 2), 1), 4);

  console.log(`[variations] Generating ${count} variations for ${parsed.data.youtubeUrl}`);

  try {
    const results = await Promise.allSettled(
      Array.from({ length: count }, (_, i) =>
        generateOneTemplate({ ...parsed.data, variationIndex: i + 1 })
      )
    );

    const slots = results.map((r, i) => {
      const variationIndex = i + 1;
      if (r.status === "fulfilled") {
        return { variationIndex, template: r.value };
      }
      const msg = r.reason instanceof Error ? r.reason.message : "Generation failed";
      return { variationIndex, error: msg };
    });

    const variations = slots
      .filter((s): s is { variationIndex: number; template: ReturnType<typeof GenerateSunoTemplateResponse.parse> } => "template" in s && s.template !== undefined)
      .map((s) => s.template);

    if (variations.length === 0) {
      const firstErrMsg = slots.find((s) => "error" in s)?.error ?? "All variations failed to generate";
      const isClientError =
        firstErrMsg.includes("Invalid YouTube URL") ||
        firstErrMsg.includes("Could not fetch video metadata");
      res.status(isClientError ? 400 : 500).json({ error: firstErrMsg });
      return;
    }

    console.log(`[variations] ${variations.length}/${count} variations succeeded`);
    res.json({ slots, variations });
  } catch (err: unknown) {
    console.error("Error generating variations:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    const isClientError =
      message.includes("Invalid YouTube URL") ||
      message.includes("Could not fetch video metadata");
    res.status(isClientError ? 400 : 500).json({ error: message });
  }
});

// ─── Playlist info endpoint ────────────────────────────────────────────────────

const PLAYLIST_CAP = 20;

/**
 * Extract playlist ID from a YouTube playlist or video URL with list= param.
 */
function extractPlaylistId(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get("list") ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch playlist video IDs and titles using the YouTube oEmbed API + RSS feed.
 * Uses the public YouTube RSS feed which doesn't require an API key.
 * Cap at PLAYLIST_CAP (20) videos.
 */
async function fetchPlaylistTracks(
  playlistId: string
): Promise<{ tracks: { videoId: string; title: string; url: string; thumbnail?: string }[]; truncated: boolean }> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
  const resp = await fetch(feedUrl, {
    headers: { "User-Agent": "SunoTemplateGenerator/1.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`Could not fetch playlist feed (status ${resp.status})`);

  const xml = await resp.text();

  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  const videoIdRegex = /<yt:videoId>([^<]+)<\/yt:videoId>/;
  const titleRegex = /<title>([^<]+)<\/title>/;

  // Collect up to PLAYLIST_CAP + 1 entries to detect whether there are more beyond the cap
  const allParsed: { videoId: string; title: string; url: string; thumbnail?: string }[] = [];
  let match;
  while ((match = entryRegex.exec(xml)) !== null && allParsed.length <= PLAYLIST_CAP) {
    const entry = match[1];
    const videoIdMatch = videoIdRegex.exec(entry);
    const titleMatch = titleRegex.exec(entry);
    if (!videoIdMatch || !titleMatch) continue;
    const videoId = videoIdMatch[1].trim();
    const rawTitle = titleMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    allParsed.push({
      videoId,
      title: rawTitle,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    });
  }
  // Truncate to cap and return with a flag indicating whether truncation occurred
  const truncated = allParsed.length > PLAYLIST_CAP;
  return { tracks: allParsed.slice(0, PLAYLIST_CAP), truncated };
}

/**
 * GET /api/playlist-info?url=...
 * Fetches playlist metadata (video IDs, titles, thumbnails) for a YouTube playlist URL.
 */
router.get("/playlist-info", async (req, res) => {
  const url = String(req.query.url ?? "");
  if (!url) {
    res.status(400).json({ error: "Missing url query parameter" });
    return;
  }

  const playlistId = extractPlaylistId(url);
  if (!playlistId) {
    res.status(400).json({ error: "URL does not contain a valid YouTube playlist ID (list= param)" });
    return;
  }

  try {
    const { tracks, truncated } = await fetchPlaylistTracks(playlistId);
    if (tracks.length === 0) {
      res.status(404).json({ error: "Playlist is empty or could not be read. Make sure it is public." });
      return;
    }

    res.json({
      playlistId,
      tracks,
      totalCount: tracks.length,
      capped: truncated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch playlist";
    console.error("[playlist-info] error:", message);
    res.status(500).json({ error: message });
  }
});

// ─── Batch generate endpoint (SSE streaming) ──────────────────────────────────

const BATCH_CONCURRENCY = 3;

/**
 * POST /api/batch
 * Accepts an array of YouTube URLs (up to 20) and streams progress via Server-Sent Events.
 * Each SSE event is a JSON object: { type: "progress" | "done" | "error", track: BatchTrackResult }
 * Processes up to BATCH_CONCURRENCY tracks at a time.
 */
router.post("/batch", async (req, res) => {
  const parsed = BatchGenerateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request. Provide an array of urls (1–20)." });
    return;
  }

  const { urls, ...sharedOpts } = parsed.data;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Track client disconnect so we can stop processing early
  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });

  // Send periodic SSE heartbeat comments to prevent proxy idle timeouts
  const heartbeat = setInterval(() => {
    if (!clientDisconnected) res.write(": heartbeat\n\n");
  }, 20000);

  const sendEvent = (type: string, data: unknown) => {
    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ type, ...( typeof data === "object" && data !== null ? data : { data }) })}\n\n`);
    }
  };

  // Send initial queued status for all tracks
  const videoIdFromUrl = (u: string): string => {
    const m = u.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : "";
  };

  const urlList: string[] = urls;
  const tracks = urlList.map((url: string, index: number) => ({
    url,
    videoId: videoIdFromUrl(url),
    status: "queued" as const,
    index,
  }));

  for (const t of tracks) {
    sendEvent("progress", { track: { ...t, status: "queued" } });
  }

  // Process with concurrency limit
  let idx = 0;

  async function processNext(): Promise<void> {
    if (idx >= tracks.length || clientDisconnected) return;
    const track = tracks[idx++];

    sendEvent("progress", { track: { ...track, status: "analyzing" } });

    try {
      sendEvent("progress", { track: { ...track, status: "generating" } });

      const template = await generateOneTemplate({
        youtubeUrl: track.url,
        ...sharedOpts,
      });

      // Try to grab thumbnail from ytdl or ytimg
      const thumbnailUrl = `https://i.ytimg.com/vi/${track.videoId}/mqdefault.jpg`;

      const result = {
        ...track,
        title: template.songTitle,
        thumbnail: thumbnailUrl,
        status: "done" as const,
        template,
      };
      sendEvent("progress", { track: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      const result = {
        ...track,
        status: "failed" as const,
        error: message,
      };
      sendEvent("progress", { track: result });
    }
  }

  try {
    const workers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(BATCH_CONCURRENCY, urls.length); w++) {
      workers.push((async () => {
        // Guard outer loop against disconnect to prevent infinite spin
        while (!clientDisconnected && idx < tracks.length) {
          await processNext();
        }
      })());
    }
    await Promise.all(workers);
  } catch (err) {
    console.error("[batch] unexpected error:", err);
  } finally {
    // Always clean up heartbeat and close stream, even on error or early exit
    clearInterval(heartbeat);
    if (!clientDisconnected) {
      sendEvent("done", { totalCount: tracks.length });
      res.end();
    }
  }
});

// ─── Genre suggestion helpers ─────────────────────────────────────────────────

/** Map of normalised MusicBrainz tag names → our genre label */
const MB_TO_OUR_GENRE: Record<string, string> = {
  // Pop
  "pop": "Pop", "dance-pop": "Dance Pop", "dance pop": "Dance Pop",
  "indie pop": "Indie Pop", "electropop": "Electropop",
  "synth-pop": "Synth-Pop", "synthpop": "Synth-Pop", "synth pop": "Synth-Pop",
  "dream pop": "Dream Pop", "chamber pop": "Chamber Pop", "baroque pop": "Baroque Pop",
  "britpop": "Britpop", "power pop": "Power Pop", "teen pop": "Teen Pop",
  "art pop": "Art Pop", "bedroom pop": "Bedroom Pop",
  "k-pop": "K-Pop", "j-pop": "J-Pop", "kpop": "K-Pop", "jpop": "J-Pop",
  // Rock
  "rock": "Rock", "alternative rock": "Alternative Rock", "alt-rock": "Alternative Rock",
  "indie rock": "Indie Rock", "hard rock": "Hard Rock", "classic rock": "Classic Rock",
  "punk rock": "Punk", "punk": "Punk", "post-punk": "Post-Punk",
  "grunge": "Grunge", "shoegaze": "Shoegaze",
  "psychedelic rock": "Psychedelic Rock", "progressive rock": "Progressive Rock", "prog rock": "Progressive Rock",
  "garage rock": "Garage Rock", "folk rock": "Folk Rock",
  "blues-rock": "Blues-Rock", "blues rock": "Blues-Rock",
  "arena rock": "Arena Rock", "new wave": "New Wave",
  "emo": "Emo", "post-rock": "Post-Rock", "stoner rock": "Stoner Rock",
  // Hip-Hop
  "hip-hop": "Hip-Hop", "hip hop": "Hip-Hop", "rap": "Rap",
  "trap": "Trap", "drill": "Drill", "boom bap": "Boom Bap",
  "gangsta rap": "Gangsta Rap", "g-funk": "G-Funk",
  "conscious hip-hop": "Conscious Hip-Hop", "lo-fi hip-hop": "Lo-Fi Hip-Hop",
  "grime": "Grime", "cloud rap": "Cloud Rap",
  "east coast hip-hop": "East Coast", "west coast hip-hop": "West Coast Rap",
  "jazz rap": "Jazz Rap", "phonk": "Phonk",
  // R&B / Soul
  "r&b": "R&B", "rhythm and blues": "R&B",
  "soul": "Soul", "neo-soul": "Neo-Soul", "neo soul": "Neo-Soul",
  "funk": "Funk", "disco": "Disco", "motown": "Motown", "gospel": "Gospel",
  "contemporary r&b": "Contemporary R&B", "psychedelic soul": "Psychedelic Soul",
  "new jack swing": "New Jack Swing",
  // Jazz
  "jazz": "Jazz", "smooth jazz": "Smooth Jazz", "bebop": "Bebop", "swing": "Swing",
  "jazz fusion": "Jazz Fusion", "big band": "Big Band", "acid jazz": "Acid Jazz",
  "cool jazz": "Cool Jazz", "modal jazz": "Modal Jazz", "latin jazz": "Latin Jazz",
  "free jazz": "Free Jazz", "nu jazz": "Nu Jazz",
  // Metal
  "metal": "Metal", "heavy metal": "Heavy Metal", "black metal": "Black Metal",
  "death metal": "Death Metal", "thrash metal": "Thrash Metal",
  "nu-metal": "Nu Metal", "nu metal": "Nu Metal",
  "metalcore": "Metalcore", "power metal": "Power Metal",
  "doom metal": "Doom Metal", "symphonic metal": "Symphonic Metal",
  "djent": "Djent", "deathcore": "Deathcore",
  "progressive metal": "Progressive Metal", "folk metal": "Folk Metal",
  // Country / Folk
  "country": "Country", "country music": "Country", "americana": "Americana",
  "bluegrass": "Bluegrass", "folk": "Folk", "indie folk": "Indie Folk",
  "outlaw country": "Outlaw Country", "country rock": "Country Rock",
  "country pop": "Country Pop", "alt-country": "Alt-Country",
  "alternative country": "Alt-Country", "honky tonk": "Honky Tonk",
  "western swing": "Western Swing",
  // Classical
  "classical": "Classical", "orchestral": "Orchestral", "baroque": "Baroque",
  "chamber music": "Chamber Music", "opera": "Opera",
  "neoclassical": "Neo-Classical", "neo-classical": "Neo-Classical",
  "minimalist": "Minimalist", "minimal": "Minimalist", "romantic": "Romantic",
  "film score": "Film Score", "cinematic": "Cinematic",
  // World
  "reggae": "Reggae", "dancehall": "Dancehall", "reggaeton": "Reggaeton",
  "latin pop": "Latin Pop", "bossa nova": "Bossa Nova", "flamenco": "Flamenco",
  "salsa": "Salsa", "cumbia": "Cumbia", "afrobeats": "Afrobeats", "afropop": "Afropop",
  "ska": "Ska", "dub": "Dub", "tropical": "Tropical",
  // Blues
  "blues": "Blues", "delta blues": "Delta Blues", "chicago blues": "Chicago Blues",
  "electric blues": "Electric Blues",
  // Electronic — House
  "house": "House", "house music": "House",
  "deep house": "Deep House", "tech house": "Tech House",
  "progressive house": "Progressive House", "acid house": "Acid House",
  "melodic house": "Melodic House", "afro house": "Afro House",
  "soulful house": "Soulful House", "chicago house": "Chicago House",
  "tribal house": "Tribal House", "micro house": "Micro House",
  "nu disco": "Nu Disco",
  // Electronic — Techno
  "techno": "Techno", "berlin techno": "Berlin Techno", "detroit techno": "Detroit Techno",
  "minimal techno": "Minimal Techno", "hard techno": "Hard Techno",
  "industrial techno": "Industrial Techno", "dub techno": "Dub Techno",
  "acid techno": "Acid Techno", "hypnotic techno": "Hypnotic Techno",
  "dark techno": "Dark Techno", "modular techno": "Modular Techno",
  // Electronic — Trance
  "trance": "Trance", "progressive trance": "Progressive Trance",
  "uplifting trance": "Uplifting Trance",
  "psytrance": "Psytrance", "psy trance": "Psytrance", "psychedelic trance": "Psytrance",
  "goa trance": "Goa Trance", "tech trance": "Tech Trance",
  "vocal trance": "Vocal Trance", "future rave": "Future Rave",
  "dark psy": "Dark Psy", "forest psy": "Forest Psy",
  // Electronic — DnB / Jungle
  "drum and bass": "Drum & Bass", "drum & bass": "Drum & Bass", "dnb": "Drum & Bass",
  "liquid dnb": "Liquid DnB", "liquid drum and bass": "Liquid DnB",
  "neurofunk": "Neurofunk", "jungle": "Jungle", "darkstep": "Darkstep",
  "jump up": "Jump Up", "techstep": "Techstep", "drumstep": "Drumstep",
  // Electronic — Dubstep & Bass
  "dubstep": "Dubstep", "post-dubstep": "Post-Dubstep",
  "brostep": "Brostep", "riddim": "Riddim", "tearout": "Tearout",
  "halfstep": "Halfstep", "deathstep": "Deathstep",
  "future bass": "Future Bass", "wave": "Wave",
  // Electronic — Breakbeat
  "breakbeat": "Breakbeat", "big beat": "Big Beat",
  "chemical breaks": "Chemical Breaks", "glitch hop": "Glitch Hop",
  "nu-skool breaks": "Nu-Skool Breaks",
  // Electronic — Synthwave
  "synthwave": "Synthwave", "synth wave": "Synthwave",
  "darksynth": "Darksynth", "outrun": "Outrun", "retrowave": "Retrowave",
  "chillwave": "Chillwave", "italo disco": "Italo Disco",
  "hi-nrg": "Hi-NRG", "hi nrg": "Hi-NRG", "futurepop": "Futurepop",
  "new romanticism": "New Romanticism",
  // Electronic — Electro / EBM
  "electro": "Electro", "ebm": "EBM", "electronic body music": "EBM",
  "industrial": "Industrial", "aggrotech": "Aggrotech",
  "dark electro": "Dark Electro", "darkwave": "Darkwave",
  "cold wave": "Cold Wave", "coldwave": "Cold Wave",
  "power noise": "Power Noise", "post-industrial": "Post-Industrial",
  // Electronic — EDM
  "edm": "EDM", "electronic dance music": "EDM",
  "electro house": "Electro House", "big room": "Big Room",
  "complextro": "Complextro", "dutch house": "Dutch House",
  // Electronic — Ambient / IDM
  "ambient": "Ambient", "dark ambient": "Dark Ambient",
  "idm": "IDM", "intelligent dance music": "IDM",
  "glitch": "Glitch", "space music": "Space Music",
  "drone": "Drone Ambient", "drone ambient": "Drone Ambient",
  "isolationism": "Isolationism", "microsound": "Microsound",
  "generative": "Generative", "new age": "New Age",
  // Electronic — Trip-Hop / Downtempo
  "trip-hop": "Trip-Hop", "trip hop": "Trip-Hop",
  "downtempo": "Downtempo", "chillhop": "Chillhop",
  "lo-fi": "Lo-Fi", "lofi": "Lo-Fi", "chillout": "Chillout",
  "electronica": "Electronica",
  // Electronic — Vaporwave / Future Funk
  "vaporwave": "Vaporwave", "future funk": "Future Funk",
  "dreampunk": "Dreampunk", "mallsoft": "Mallsoft",
  "city pop": "City Pop Revival",
  "vaportrap": "Vaportrap", "hardvapour": "Hardvapour",
  // Electronic — Hardcore
  "hardcore": "Hardcore", "gabber": "Gabber", "hardstyle": "Hardstyle",
  "frenchcore": "Frenchcore", "happy hardcore": "Happy Hardcore",
  "uk hardcore": "UK Hardcore", "speedcore": "Speedcore",
  "rawstyle": "Rawstyle", "industrial hardcore": "Industrial Hardcore",
  // Electronic — UK Garage / Grime
  "uk garage": "UK Garage", "2-step": "2-Step", "2-step garage": "2-Step",
  "bassline": "Bassline", "uk bass": "UK Bass",
  "speed garage": "Speed Garage",
  // Electronic — Phonk / Hyperpop
  "memphis phonk": "Memphis Phonk", "slavic phonk": "Slavic Phonk",
  "drift phonk": "Drift Phonk", "dark phonk": "Dark Phonk",
  "hyperpop": "Hyperpop", "digicore": "Digicore",
  // Electronic — Afro
  "amapiano": "Amapiano", "gqom": "Gqom",
  "baile funk": "Baile Funk", "kuduro": "Kuduro",
  "footwork": "Footwork", "juke": "Juke", "kwaito": "Kwaito",
};

/** Maps matched genre names to an energy level */
const GENRE_TO_ENERGY: Record<string, string> = {
  "Ambient": "very chill", "Dark Ambient": "very chill",
  "Drone Ambient": "very chill", "Space Music": "very chill",
  "Isolationism": "very chill", "Microsound": "very chill",
  "Lo-Fi": "chill", "Trip-Hop": "chill", "Downtempo": "chill",
  "Chillhop": "chill", "Chillwave": "chill", "IDM": "chill",
  "New Age": "chill", "Nu Jazz": "chill", "Chillout": "chill",
  "Folk": "chill", "Indie Folk": "chill",
  "Jazz": "medium", "Smooth Jazz": "medium", "Blues": "medium",
  "Classical": "medium", "Orchestral": "medium", "Country": "medium",
  "Pop": "medium", "Rock": "medium", "R&B": "medium",
  "Soul": "medium", "Neo-Soul": "medium",
  "Indie Pop": "medium", "Indie Rock": "medium",
  "Bedroom Pop": "medium", "Dream Pop": "medium",
  "House": "high", "Trance": "high", "Techno": "high",
  "Hip-Hop": "high", "Trap": "high", "Funk": "high", "Disco": "high",
  "Electro": "high", "EBM": "high", "UK Garage": "high",
  "Grime": "high", "Synth-Pop": "high", "New Wave": "high",
  "Dance Pop": "high", "Electropop": "high",
  "Drum & Bass": "intense", "Liquid DnB": "high",
  "Neurofunk": "intense", "Darkstep": "intense",
  "Jump Up": "intense", "Jungle": "intense",
  "Hardstyle": "intense", "Hardcore": "intense",
  "Gabber": "intense", "Speedcore": "intense",
  "Industrial Hardcore": "intense", "Frenchcore": "intense",
  "Psytrance": "intense", "Hard Techno": "intense",
  "Tearout": "intense", "Deathstep": "intense",
  "Metal": "intense", "Heavy Metal": "intense",
  "Black Metal": "intense", "Death Metal": "intense",
  "Thrash Metal": "intense", "Metalcore": "intense",
};

/** Maps matched genre names to a tempo */
const GENRE_TO_TEMPO: Record<string, string> = {
  "Drum & Bass": "hyper", "Neurofunk": "hyper", "Darkstep": "hyper",
  "Jungle": "hyper", "Jump Up": "hyper", "Drumstep": "hyper",
  "Speedcore": "fast", "Gabber": "fast", "Frenchcore": "fast",
  "Hardcore": "fast", "Industrial Hardcore": "fast", "Hard Techno": "fast",
  "Hardstyle": "fast", "Psytrance": "fast", "Techno": "fast",
  "House": "uptempo", "Trance": "uptempo", "Dance Pop": "uptempo",
  "Electro House": "uptempo", "EDM": "uptempo", "Big Room": "uptempo",
  "UK Garage": "uptempo", "Breakbeat": "uptempo", "Big Beat": "uptempo",
  "Hip-Hop": "groove", "Funk": "groove", "R&B": "groove",
  "Disco": "groove", "Afrobeats": "groove", "Amapiano": "groove",
  "Footwork": "groove", "Boom Bap": "groove", "Grime": "groove",
  "Pop": "mid", "Rock": "mid", "Jazz": "mid",
  "Alternative Rock": "mid", "Indie Rock": "mid",
  "Soul": "mid", "Country": "mid",
  "Lo-Fi": "slow", "Downtempo": "slow", "Trip-Hop": "slow",
  "Ambient": "slow", "IDM": "slow", "Chillhop": "slow",
  "New Age": "slow", "Chillwave": "slow",
};

function mapMbTagsToGenres(mbTags: string[]): string[] {
  const mapped: string[] = [];
  for (const tag of mbTags) {
    const key = tag.toLowerCase().trim();
    const genre = MB_TO_OUR_GENRE[key];
    if (genre && !mapped.includes(genre)) {
      mapped.push(genre);
    }
  }
  return mapped.slice(0, 5);
}

function yearToEra(releaseYear?: string): string | null {
  if (!releaseYear) return null;
  const y = parseInt(releaseYear, 10);
  if (isNaN(y)) return null;
  if (y < 1960) return "50s";
  if (y < 1970) return "60s";
  if (y < 1980) return "70s";
  if (y < 1990) return "80s";
  if (y < 2000) return "90s";
  if (y < 2010) return "2000s";
  if (y < 2020) return "2010s";
  return "modern";
}

function inferEnergy(genres: string[]): string | null {
  for (const g of genres) {
    const e = GENRE_TO_ENERGY[g];
    if (e) return e;
  }
  return null;
}

function inferTempo(genres: string[]): string | null {
  for (const g of genres) {
    const t = GENRE_TO_TEMPO[g];
    if (t) return t;
  }
  return null;
}

/**
 * GET /api/suggest?title=...&artist=...
 * Accepts the clean song title and artist directly (passed by the frontend after youtube-preview resolves).
 * Uses MusicBrainz for release year/era, then AI to identify genres/energy/tempo.
 */
router.get("/suggest", async (req, res) => {
  const title = (req.query.title as string ?? "").trim();
  const artist = (req.query.artist as string ?? "").trim();

  if (!title || !artist) {
    res.status(400).json({ error: "title and artist query params are required" });
    return;
  }

  try {
    // Run MusicBrainz and AI in parallel for speed
    const [mbData, aiSuggestion] = await Promise.all([
      Promise.race([
        fetchMusicBrainzData(artist, title),
        new Promise<MusicBrainzData>((resolve) => setTimeout(() => resolve({}), 7000)),
      ]),
      (async () => {
        try {
          const completion = await openai.chat.completions.create({
            model: AI_MINI_MODEL,
            max_tokens: 500,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `You are an expert music analyst. Given a song title and artist, return a JSON object with ALL of these fields:
- "genres": array of 1–3 genre names from this list ONLY: Pop, Dance Pop, Indie Pop, Synth-Pop, Dream Pop, Art Pop, Electropop, Britpop, Rock, Alternative Rock, Indie Rock, Hard Rock, Classic Rock, Punk, Post-Punk, Grunge, Shoegaze, Psychedelic Rock, Progressive Rock, Garage Rock, Folk Rock, Arena Rock, New Wave, Emo, Post-Rock, Stoner Rock, Hip-Hop, Trap, Rap, Drill, Boom Bap, Gangsta Rap, G-Funk, Grime, Cloud Rap, Phonk, R&B, Soul, Neo-Soul, Funk, Disco, Motown, Gospel, Contemporary R&B, Jazz, Smooth Jazz, Bebop, Swing, Jazz Fusion, Big Band, Acid Jazz, Cool Jazz, Latin Jazz, Free Jazz, Metal, Heavy Metal, Black Metal, Death Metal, Thrash Metal, Nu Metal, Metalcore, Power Metal, Doom Metal, Symphonic Metal, Djent, Country, Americana, Bluegrass, Folk, Indie Folk, Outlaw Country, Country Rock, Country Pop, Alt-Country, Classical, Orchestral, Baroque, Cinematic, Film Score, Opera, Minimalist, Reggae, Dancehall, Reggaeton, Latin Pop, Bossa Nova, Flamenco, Salsa, K-Pop, J-Pop, Afrobeats, Blues, Delta Blues, Chicago Blues, Electric Blues, House, Deep House, Tech House, Progressive House, Acid House, Melodic House, Afro House, Soulful House, Chicago House, Nu Disco, Techno, Berlin Techno, Detroit Techno, Minimal Techno, Hard Techno, Dub Techno, Trance, Progressive Trance, Uplifting Trance, Psytrance, Goa Trance, Vocal Trance, Future Rave, Drum & Bass, Liquid DnB, Neurofunk, Darkstep, Jump Up, Jungle, Dubstep, Post-Dubstep, Brostep, Riddim, Future Bass, Breakbeat, Big Beat, Glitch Hop, Synthwave, Darksynth, Outrun, Retrowave, Chillwave, Hi-NRG, Italo Disco, Futurepop, Electro, EBM, Industrial, Darkwave, Cold Wave, EDM, Big Room, Electro House, Ambient, Dark Ambient, IDM, Glitch, Space Music, Drone Ambient, New Age, Trip-Hop, Downtempo, Chillhop, Lo-Fi, Vaporwave, Future Funk, Hardcore, Gabber, Hardstyle, UK Garage, 2-Step, Grime, UK Bass, Phonk, Memphis Phonk, Hyperpop, Amapiano, Gqom, Baile Funk, Footwork
- "era": one of: 50s, 60s, 70s, 80s, 90s, 2000s, 2010s, modern
- "energy": one of: very chill, chill, medium, high, intense
- "tempo": one of: ballad, slow, mid, groove, uptempo, fast, hyper
- "vocals": one of: male, female, mixed, duet, no vocals
- "moods": array of 1–3 mood tags from ONLY: Dark, Euphoric, Nostalgic, Melancholic, Aggressive, Romantic, Dreamy, Rebellious, Playful, Mysterious, Cinematic, Hopeful, Angry, Tender, Haunted, Triumphant, Vulnerable, Defiant, Serene, Intense, Wistful, Bittersweet, Groovy, Frantic, Ethereal, Hypnotic, Brooding, Raw, Gritty, Majestic, Eerie, Sensual, Savage, Soulful, Cathartic, Blissful, Chaotic, Anxious, Desolate, Primal, Lush, Fierce, Longing, Psychedelic, Icy, Dusty, Tense, Laid-back, Transcendent, Unsettling, Festive, Intimate, Epic, Punchy, Stormy, Quirky
- "instruments": array of 2–4 primary instruments from ONLY: Piano, Guitar, Synth, Strings, Bass, Choir, Brass, Drums, Violin, Flute, Organ, Sitar, Cello, Saxophone, Trumpet, Harp, Banjo, Ukulele, Mandolin, Marimba, Theremin, Mellotron, Pedal Steel, Dulcimer, 808, Acoustic Guitar, Electric Guitar, Harmonica, Accordion, Vibraphone, Rhodes, Clarinet, Oboe, French Horn, Tabla, Congas, Sub Bass, Pad, Wurlitzer, Harpsichord, Moog, Steel Drums, Trombone, Lap Steel
- "bpm": estimated BPM as integer (e.g. 120)
- "key": musical key (e.g. "A minor", "C major", "F# minor")
- "chordProgression": the likely main chord progression (e.g. "Am - F - C - G")
- "vocalPersona": a 1-sentence description of the lead vocalist's voice character (e.g. "Male baritone, weathered and raspy with emotional dynamic range from gritty whisper to soaring belt")
- "sonicDna": a 1-sentence description of the artist's signature sonic traits WITHOUT using the artist name (e.g. "Vintage synths, punchy 808s, ethereal falsetto, dark atmospheric tension, neon-lit melancholy")
- "metaTags": array of structural section tags that fit this song (e.g. ["Intro","Verse","Pre-Chorus","Chorus","Verse","Pre-Chorus","Chorus","Bridge","Chorus","Outro"])

Be accurate and specific to the actual song. Use your knowledge of the real recording.`,
              },
              {
                role: "user",
                content: `Song: "${title}" by ${artist}`,
              },
            ],
          });
          const raw = completion.choices[0]?.message?.content ?? "{}";
          return JSON.parse(raw) as {
            genres?: string[]; era?: string; energy?: string; tempo?: string;
            vocals?: string; moods?: string[]; instruments?: string[];
            bpm?: number; key?: string; chordProgression?: string;
            vocalPersona?: string; sonicDna?: string; metaTags?: string[];
          };
        } catch {
          return {};
        }
      })(),
    ]);

    const mbTags = mbData.genres ?? [];
    const mbGenres = mapMbTagsToGenres(mbTags);

    // Merge: AI provides genres/energy/tempo, MusicBrainz provides era (more accurate release year)
    const mbEra = yearToEra(mbData.releaseYear);
    const aiGenres = (aiSuggestion.genres ?? []).filter((g) => typeof g === "string").slice(0, 3);
    const genres = aiGenres.length > 0 ? aiGenres : mbGenres;
    const era = mbEra ?? (aiSuggestion.era as string | null) ?? null;
    const energy = (aiSuggestion.energy as string | null) ?? inferEnergy(genres);
    const tempo = (aiSuggestion.tempo as string | null) ?? inferTempo(genres);
    const vocals = (aiSuggestion.vocals as string | null) ?? null;
    const moods = (aiSuggestion.moods ?? []).filter((m) => typeof m === "string").slice(0, 3);
    const instruments = (aiSuggestion.instruments ?? []).filter((i) => typeof i === "string").slice(0, 4);
    const bpm = typeof aiSuggestion.bpm === "number" && aiSuggestion.bpm >= 40 && aiSuggestion.bpm <= 300 ? aiSuggestion.bpm : null;
    const key = typeof aiSuggestion.key === "string" ? aiSuggestion.key : null;
    const chordProgression = typeof aiSuggestion.chordProgression === "string" ? aiSuggestion.chordProgression : null;
    const vocalPersona = typeof aiSuggestion.vocalPersona === "string" ? aiSuggestion.vocalPersona : null;
    const sonicDna = typeof aiSuggestion.sonicDna === "string" ? aiSuggestion.sonicDna : null;
    const metaTags = (aiSuggestion.metaTags ?? []).filter((t) => typeof t === "string");

    // Compute slider heuristics based on genre characteristics
    const isComplex = genres.some((g) => /Progressive|Jazz|Classical|Orchestral|Film Score|IDM|Experimental/i.test(g));
    const isElectronic = genres.some((g) => /House|Techno|Trance|EDM|Dubstep|Drum & Bass|Breakbeat|Synthwave|Electro|Ambient/i.test(g));
    const suggestedWeirdness = isComplex ? 55 : isElectronic ? 60 : 62;
    const suggestedStyleInfluence = 80;
    const suggestedAudioInfluence = 25;

    console.log(`[suggest] ${artist} – ${title} → AI genres:[${genres.join(",")}] MB era:${mbEra} AI era:${aiSuggestion.era} energy:${energy} tempo:${tempo} vocals:${vocals} moods:[${moods.join(",")}] bpm:${bpm}`);

    res.json({
      genres, era, energy, tempo, vocals, moods, instruments,
      bpm, key, chordProgression, vocalPersona, sonicDna, metaTags,
      weirdness: suggestedWeirdness, styleInfluence: suggestedStyleInfluence, audioInfluence: suggestedAudioInfluence,
      songTitle: title, artist, mbTags,
    });
  } catch (err) {
    console.error("suggest error:", err);
    res.status(500).json({ error: "Could not fetch suggestions" });
  }
});

/**
 * GET /api/youtube-preview?url=...
 * Lightweight endpoint — returns just thumbnail, title, author for the song preview card.
 * Does NOT fetch lyrics or call AI.
 */
router.get("/youtube-preview", async (req, res) => {
  const url = req.query.url as string;
  if (!url || !isValidSourceUrl(url)) {
    res.status(400).json({ error: "Invalid URL — provide a YouTube or Deezer track link" });
    return;
  }

  // Deezer URLs are handled by the deezer-preview endpoint logic, but also work here
  if (isDeezerUrl(url)) {
    const trackId = deezerTrackIdFromUrl(url);
    try {
      const resp = await fetch(`https://api.deezer.com/track/${trackId}`, {
        headers: { "User-Agent": "SunoTemplateGenerator/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      const track = await resp.json() as {
        title?: string; duration?: number; bpm?: number;
        artist?: { name?: string }; album?: { title?: string; cover_medium?: string; release_date?: string };
        release_date?: string; error?: { message?: string };
      };
      if (track.error) throw new Error(track.error.message);
      const cleanTitle = (track.title ?? "").trim();
      const cleanArtist = (track.artist?.name ?? "").trim();
      res.json({
        title: `${cleanArtist} - ${cleanTitle}`,
        cleanTitle,
        author: cleanArtist,
        thumbnail: track.album?.cover_medium ?? null,
        duration: track.duration ? formatDuration(track.duration) : null,
      });
    } catch (err) {
      res.status(500).json({ error: `Deezer fetch failed: ${(err as Error).message}` });
    }
    return;
  }

  const videoId = videoIdFromUrl(url);
  // YouTube always serves the mqdefault thumbnail for any public video
  const thumbFallback = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;

  // ── Strategy 1: oEmbed (works for all public videos, no rate-limit, no bot-detection) ──
  try {
    const oembed = await fetchViaOembed(url);
    const { cleanTitle, cleanArtist } = cleanSongTitle(oembed.title, oembed.author);
    // oEmbed gives a 120x90 thumb — prefer our mqdefault URL which is larger
    const thumbnail = thumbFallback ?? oembed.thumbnail ?? null;
    console.log(`[youtube-preview] oEmbed OK: "${cleanTitle}" by "${cleanArtist}"`);
    res.json({ title: oembed.title, cleanTitle, author: cleanArtist || oembed.author, thumbnail, duration: null });
    return;
  } catch {
    console.warn("[youtube-preview] oEmbed failed — trying ytdl fallback");
  }

  // ── Strategy 2: ytdl-core (has richer data but often blocked on RPi) ──
  try {
    const info = await ytdl.getBasicInfo(url, {
      requestOptions: { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" } },
    });
    const vd = info.videoDetails;
    const { cleanTitle, cleanArtist } = cleanSongTitle(vd.title ?? "", vd.author?.name ?? "");
    const thumb = vd.thumbnails?.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? thumbFallback;
    console.log(`[youtube-preview] ytdl OK: "${cleanTitle}" by "${cleanArtist}"`);
    res.json({
      title: vd.title ?? "Unknown Title",
      cleanTitle,
      author: cleanArtist || vd.author?.name || "Unknown Artist",
      thumbnail: thumb,
      duration: vd.lengthSeconds ? formatDuration(Number(vd.lengthSeconds)) : null,
    });
  } catch (err) {
    console.error("[youtube-preview] all strategies failed:", (err as Error).message?.slice(0, 120));
    // Still return partial data (thumbnail always works)
    res.json({ title: "", cleanTitle: "", author: "", thumbnail: thumbFallback, duration: null });
  }
});

/**
 * POST /api/pre-analyze-structure
 * Pre-generation endpoint: fetches lyrics for a YouTube URL and returns a LyricsStructure.
 * Called automatically after video preview loads, enabling structure editing BEFORE generation.
 */
router.post("/pre-analyze-structure", async (req, res) => {
  const { youtubeUrl } = req.body as { youtubeUrl?: string };
  if (!youtubeUrl || !isValidSourceUrl(youtubeUrl)) {
    res.status(400).json({ error: "Provide a valid YouTube or Deezer URL." });
    return;
  }
  try {
    const vid = sourceIdFromUrl(youtubeUrl);
    let metadata: VideoMetadata;

    if (vid) {
      // Stage 1: base metadata
      let base = cacheGet<BaseVideoMetadata>(`metadata:${vid}`);
      if (!base) {
        base = isDeezerUrl(youtubeUrl) ? await fetchBaseMetadataFromDeezer(youtubeUrl) : await fetchBaseMetadata(youtubeUrl);
        cacheSet(`metadata:${vid}`, base, TTL.METADATA);
      }
      // Stage 2: audio features (permanent) — populate cache opportunistically
      if (!cacheGet<CachedAudioFeatures>(`features:${vid}`)) {
        const result = await detectAudioFeatures({
          artist: base.cleanArtist,
          title: base.cleanTitle,
          youtubeUrl,
          descriptionBpm: base.descriptionData?.bpm,
          descriptionKey: base.descriptionData?.key,
        });
        cacheSet<CachedAudioFeatures>(`features:${vid}`, { features: result }, TTL.FEATURES);
      }
      // Stage 3: lyrics
      let cachedLyrics = cacheGet<CachedLyrics>(`lyrics:${vid}`);
      if (!cachedLyrics) {
        cachedLyrics = await fetchLyricsData(base.cleanArtist, base.cleanTitle, base.durationSeconds, base.captionText);
        cacheSet(`lyrics:${vid}`, cachedLyrics, TTL.LYRICS);
      }
      const cachedFeatures = cacheGet<CachedAudioFeatures>(`features:${vid}`);
      metadata = assembleMetadata(base, cachedLyrics, cachedFeatures?.features ?? undefined);
    } else {
      metadata = await fetchAllMetadata(youtubeUrl);
    }

    if (!metadata.lyricsText || metadata.lyricsText.trim().length < 30) {
      res.status(404).json({ error: "No lyrics found for this song." });
      return;
    }
    const structure = analyzeLyricsStructure(metadata.lyricsText);
    res.json(structure);
  } catch (err) {
    console.error("pre-analyze-structure error:", err);
    res.status(500).json({ error: "Could not analyze song structure." });
  }
});

/**
 * POST /api/analyze-structure
 * Pre-generation endpoint: given raw lyrics text, returns a LyricsStructure analysis.
 * Allows users to see and edit section layout before the first generation request.
 */
router.post("/analyze-structure", (req, res) => {
  const { lyrics } = req.body as { lyrics?: string };
  if (!lyrics || typeof lyrics !== "string" || lyrics.trim().length < 10) {
    res.status(400).json({ error: "Provide at least 10 characters of lyrics text." });
    return;
  }
  try {
    const structure = analyzeLyricsStructure(lyrics);
    res.json(structure);
  } catch (err) {
    console.error("analyze-structure error:", err);
    res.status(500).json({ error: "Could not analyze lyrics structure." });
  }
});

// ─── Transformation presets ────────────────────────────────────────────────

interface TransformPreset {
  id: string;
  name: string;
  category: "era" | "genre" | "mood" | "energy";
  instruction: string;
}

export const TRANSFORM_PRESETS: TransformPreset[] = [
  // Era
  { id: "era-1960s", name: "1960s", category: "era", instruction: "Shift all era and decade references to 1960s: add British Invasion, Motown, psychedelic rock, vintage reverb. Remove any modern production tags." },
  { id: "era-1970s", name: "1970s", category: "era", instruction: "Shift to 1970s: add classic rock, funk groove, progressive rock, analogue warmth, FM radio sound. Remove modern/digital tags." },
  { id: "era-1980s", name: "1980s", category: "era", instruction: "Shift to 1980s: add synth-pop, gated reverb drums, glossy production, new wave. Remove acoustic/organic tags." },
  { id: "era-1990s", name: "1990s", category: "era", instruction: "Shift to 1990s: add grunge, alternative rock, lo-fi tape warmth, Britpop, 90s production. Remove modern sheen." },
  { id: "era-2000s", name: "2000s", category: "era", instruction: "Shift to 2000s: add pop-punk, emo, glossy pop, hip-hop influenced production. Remove retro warmth." },
  { id: "era-modern", name: "Modern", category: "era", instruction: "Make it contemporary 2020s: add hyperpop, modern production, crisp digital clarity, current trends. Remove vintage warmth." },
  // Genre
  { id: "genre-lofi", name: "Lo-Fi", category: "genre", instruction: "Transform into a lo-fi genre: add vinyl crackle, tape hiss, dusty samples, bedroom lo-fi, mellow keys. Remove high-energy or shiny production descriptors." },
  { id: "genre-orchestral", name: "Orchestral", category: "genre", instruction: "Transform into cinematic orchestral: add sweeping strings, brass, full orchestra, cinematic score, Hans Zimmer-inspired. Remove electronic/synth elements." },
  { id: "genre-edm", name: "EDM", category: "genre", instruction: "Transform into electronic dance: add 4/4 kick, festival drop, synthesizer leads, sidechain compression, euphoric build. Remove acoustic/organic elements." },
  { id: "genre-jazz", name: "Jazz", category: "genre", instruction: "Transform into jazz: add swing feel, walking bass, jazz harmony, brushed drums, cool jazz or bossa nova influence. Remove digital/electronic production." },
  { id: "genre-acoustic", name: "Acoustic", category: "genre", instruction: "Transform into acoustic: add fingerpicked guitar, natural room reverb, stripped-back arrangement, organic warmth. Remove electronic/synthesized elements." },
  { id: "genre-hiphop", name: "Hip-Hop", category: "genre", instruction: "Transform into hip-hop: add boom bap or trap beat, 808 bass, vinyl samples, rhythmic groove, urban production. Remove orchestral/live-band elements." },
  { id: "genre-metal", name: "Metal", category: "genre", instruction: "Transform into metal: add heavy distorted guitars, double kick drums, aggressive energy, crushing riffs. Remove gentle/soft production descriptors." },
  // Mood
  { id: "mood-darker", name: "Darker", category: "mood", instruction: "Shift mood to darker and more brooding: add minor tonality, haunting atmosphere, melancholy, shadowy undertones. Remove uplifting/bright mood descriptors." },
  { id: "mood-uplifting", name: "More Uplifting", category: "mood", instruction: "Shift mood to uplifting and hopeful: add major key brightness, soaring melodies, triumphant energy, euphoric feel. Remove dark/melancholy tags." },
  { id: "mood-aggressive", name: "More Aggressive", category: "mood", instruction: "Shift mood to aggressive and intense: add driven energy, fierce delivery, pounding rhythm, raw power. Remove calm/gentle mood descriptors." },
  { id: "mood-calmer", name: "Calmer", category: "mood", instruction: "Shift mood to calm and serene: add gentle pacing, soft dynamics, meditative stillness, peaceful atmosphere. Remove aggressive/high-energy descriptors." },
  // Energy
  { id: "energy-ramp", name: "Ramp Up", category: "energy", instruction: "Increase energy level significantly: add faster tempo feel, more drive, higher BPM tags, energetic production. Remove slow/chill descriptors." },
  { id: "energy-wind", name: "Wind Down", category: "energy", instruction: "Decrease energy level significantly: add slower tempo feel, gentle groove, relaxed pacing, chillout atmosphere. Remove high-energy/fast descriptors." },
];

/**
 * POST /api/transform
 * Lightweight transformation — takes the current styleOfMusic + negativePrompt and
 * applies a targeted delta (era shift, genre pivot, mood shift, energy change).
 * Does NOT touch lyrics. Returns only the changed fields.
 */
router.post("/suno/transform", async (req, res) => {
  const parseResult = TransformTemplateBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request", details: parseResult.error.flatten() });
    return;
  }

  const { styleOfMusic, negativePrompt, transformId } = parseResult.data;
  const preset = TRANSFORM_PRESETS.find((p) => p.id === transformId);
  if (!preset) {
    res.status(400).json({ error: `Unknown transform id: ${transformId}` });
    return;
  }

  const systemPrompt = `You are a Suno.ai prompt engineer. Your job is to apply targeted transformations to an existing style prompt and negative prompt. 

Rules:
1. Only modify styleOfMusic and negativePrompt — never touch lyrics.
2. Keep styleOfMusic under 900 characters total. Trim cleanly — no half-words.
3. Keep negativePrompt between 180–199 characters total. Pad with synonyms if needed. If impossible, keep 170–199 chars.
4. Preserve all comma-separated tag structure. Output tags as comma-separated values.
5. Do not add cliché vague words like "epic", "amazing", "perfect". Be specific.
6. Return ONLY a JSON object with two fields: styleOfMusic, negativePrompt.`;

  const userPrompt = `Current styleOfMusic:
${styleOfMusic}

Current negativePrompt:
${negativePrompt}

Transformation to apply: "${preset.name}" (${preset.category})
Instruction: ${preset.instruction}

Apply the transformation and return the updated styleOfMusic and negativePrompt as a JSON object.`;

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MINI_MODEL,
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, string>;
    try { parsed = JSON.parse(raw) as Record<string, string>; }
    catch { parsed = {}; }

    const updatedStyle = typeof parsed.styleOfMusic === "string" ? parsed.styleOfMusic.slice(0, 900) : styleOfMusic;
    const updatedNeg = typeof parsed.negativePrompt === "string" ? parsed.negativePrompt.slice(0, 199) : negativePrompt;

    res.json({ styleOfMusic: updatedStyle, negativePrompt: updatedNeg });
  } catch (err) {
    console.error("transform error:", err);
    res.status(500).json({ error: "Transform failed" });
  }
});

/**
 * GET /api/cache/stats
 * Returns cache size and hit/miss statistics for the current process.
 * Protected by ADMIN_KEY environment variable when set.
 */
router.get("/cache/stats", (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (adminKey) {
    const provided = req.headers["x-admin-key"] ?? req.query.key;
    if (provided !== adminKey) {
      res.status(401).json({ error: "Unauthorized — provide x-admin-key header or ?key= query param." });
      return;
    }
  }
  res.json(cacheStats());
});

/**
 * POST /api/multi-track
 * Generates 4 complementary Suno templates for a full arrangement:
 * lead vocal, harmony/backing, instrumental bed, rhythm/percussion.
 * Each is tuned to complement the others in key, BPM, and energy arc.
 */
router.post("/multi-track", async (req, res) => {
  const { youtubeUrl, vocalGender, energyLevel, era, mode, genres, moods, instruments } =
    req.body as {
      youtubeUrl?: string;
      vocalGender?: string;
      energyLevel?: string;
      era?: string;
      mode?: string;
      genres?: string[];
      moods?: string[];
      instruments?: string[];
    };

  if (!youtubeUrl) {
    res.status(400).json({ error: "youtubeUrl is required" });
    return;
  }

  const baseParams = {
    youtubeUrl,
    vocalGender: vocalGender as GenerateInput["vocalGender"],
    energyLevel: energyLevel as GenerateInput["energyLevel"],
    era: era as GenerateInput["era"],
    mode: mode as GenerateInput["mode"],
    genres,
    moods,
    instruments,
  };

  const TRACK_DEFS = [
    {
      id: "lead",
      label: "Lead Vocal",
      icon: "mic",
      genreNudge: "lead vocal arrangement, main melody prominent, full production",
    },
    {
      id: "harmony",
      label: "Harmony / Backing",
      icon: "layers",
      genreNudge: "backing vocals, harmonies, supporting arrangement, complementary layers",
    },
    {
      id: "instrumental",
      label: "Instrumental Bed",
      icon: "music",
      genreNudge: "instrumental only, no vocals, rich atmospheric bed, melodic instruments",
    },
    {
      id: "rhythm",
      label: "Rhythm / Percussion",
      icon: "drum",
      genreNudge: "percussion-focused, drum patterns, groove-driven, rhythmic bed",
    },
  ] as const;

  try {
    const results = await Promise.allSettled(
      TRACK_DEFS.map((track, i) =>
        generateOneTemplate({
          ...baseParams,
          variationIndex: i + 1,
          genreNudge: track.genreNudge,
          isInstrumental: track.id === "instrumental" || track.id === "rhythm",
        })
      )
    );

    const tracks = results.map((r, i) => ({
      id: TRACK_DEFS[i].id,
      label: TRACK_DEFS[i].label,
      icon: TRACK_DEFS[i].icon,
      template: r.status === "fulfilled" ? r.value : null,
      error: r.status === "rejected" ? String((r.reason as Error).message ?? r.reason) : null,
    }));

    res.json({ tracks });
  } catch (err) {
    console.error("[multi-track] error:", err);
    res.status(500).json({ error: "Multi-track generation failed" });
  }
});

/**
 * POST /api/transition
 * Generates a bridge/transition template between two songs.
 * Analyzes both and creates a crossfade-appropriate template.
 */
router.post("/transition", async (req, res) => {
  const {
    fromUrl,
    toUrl,
    style = "smooth",
    vocalGender,
    energyLevel,
  } = req.body as {
    fromUrl?: string;
    toUrl?: string;
    style?: "smooth" | "key-change" | "genre-blend" | "breakdown";
    vocalGender?: string;
    energyLevel?: string;
  };

  if (!fromUrl || !toUrl) {
    res.status(400).json({ error: "fromUrl and toUrl are required" });
    return;
  }
  if (!isValidYouTubeUrl(fromUrl) || !isValidYouTubeUrl(toUrl)) {
    res.status(400).json({ error: "Both URLs must be valid YouTube URLs" });
    return;
  }

  const STYLE_NUDGES: Record<string, string> = {
    smooth: "seamless crossfade blend, gradual energy shift, overlapping textures",
    "key-change": "dramatic key modulation, key change transition, harmonic pivot, tension and release",
    "genre-blend": "genre fusion hybrid, blending two musical worlds, stylistic bridge",
    breakdown: "breakdown drop, stripped-back minimal section, tension build, sudden energy drop then rise",
  };

  const nudge = STYLE_NUDGES[style] ?? STYLE_NUDGES.smooth;

  const typedVocalGender = vocalGender as GenerateInput["vocalGender"];
  const typedEnergyLevel = energyLevel as GenerateInput["energyLevel"];

  try {
    const [fromResult, toResult] = await Promise.allSettled([
      generateOneTemplate({ youtubeUrl: fromUrl, vocalGender: typedVocalGender, energyLevel: typedEnergyLevel }),
      generateOneTemplate({ youtubeUrl: toUrl, vocalGender: typedVocalGender, energyLevel: typedEnergyLevel }),
    ]);

    const fromTemplate = fromResult.status === "fulfilled" ? fromResult.value : null;
    const toTemplate = toResult.status === "fulfilled" ? toResult.value : null;

    if (!fromTemplate || !toTemplate) {
      res.status(500).json({ error: "Could not analyze one or both songs" });
      return;
    }

    // Build a transition style that blends both
    const blendedStyle = `${fromTemplate.styleOfMusic.slice(0, 300)}, transition bridge, ${nudge}, ${toTemplate.styleOfMusic.slice(0, 200)}`;
    const transitionTitle = `${fromTemplate.songTitle} → ${toTemplate.songTitle} Transition`;

    // Generate a transition-specific template using the blended context
    const transitionTemplate = await generateOneTemplate({
      youtubeUrl: fromUrl,
      vocalGender: typedVocalGender,
      energyLevel: typedEnergyLevel,
      genreNudge: `transition bridge between two songs: ${nudge}. Song A: ${fromTemplate.artist} — ${fromTemplate.songTitle}. Song B: ${toTemplate.artist} — ${toTemplate.songTitle}. Create a smooth 30-second transition template.`,
    });

    res.json({
      from: { title: fromTemplate.songTitle, artist: fromTemplate.artist, template: fromTemplate },
      to: { title: toTemplate.songTitle, artist: toTemplate.artist, template: toTemplate },
      transition: {
        ...transitionTemplate,
        title: transitionTitle,
        styleOfMusic: blendedStyle.slice(0, 999),
      },
      style,
    });
  } catch (err) {
    console.error("[transition] error:", err);
    res.status(500).json({ error: "Transition generation failed" });
  }
});

/**
 * POST /api/reverse
 * Reverse-engineers a Suno template back to inferred source song and settings.
 * Useful when you have a great Suno output and want to recreate/modify the prompt.
 */
router.post("/reverse", async (req, res) => {
  const { templateText } = req.body as { templateText?: string };
  if (!templateText || templateText.trim().length < 20) {
    res.status(400).json({ error: "templateText is required (min 20 chars)" });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MINI_MODEL,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a music analyst. Given a Suno.ai music generation template (style prompt, lyrics, and/or negative prompt), analyze it and reverse-engineer the likely source material and generation settings. Return a JSON object with exactly these fields:
- "inferredSong": string — most likely song title being covered/inspired (or null if unclear)
- "inferredArtist": string — most likely artist (or null if unclear)
- "inferredGenres": string[] — array of 1–4 genre names you detect in the template
- "inferredEra": string — detected decade/era (50s/60s/70s/80s/90s/2000s/2010s/modern)
- "inferredEnergy": string — one of: very chill, chill, medium, high, intense
- "inferredTempo": string — one of: ballad, slow, mid, groove, uptempo, fast, hyper
- "inferredMoods": string[] — array of 1–3 mood descriptors
- "inferredInstruments": string[] — array of prominent instruments mentioned
- "keySignature": string — detected key if mentioned (e.g. "E minor", "C major", or null)
- "bpm": number — detected BPM if mentioned (or null)
- "styleConfidence": number — confidence 0–100 in your genre/style inference
- "reasoning": string — brief explanation (max 80 words) of your analysis`,
        },
        {
          role: "user",
          content: `Analyze this Suno template:\n\n${templateText.slice(0, 3000)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (err) {
    console.error("[reverse] error:", err);
    res.status(500).json({ error: "Reverse analysis failed" });
  }
});

/**
 * POST /api/mood-to-settings
 * Converts a free-text vibe/mood description into structured style settings.
 * e.g. "rainy Sunday morning, coffee shop, slightly melancholy but hopeful"
 * → { genres, moods, energy, tempo, era, instruments, reasoning }
 */
router.post("/mood-to-settings", async (req, res) => {
  const { description } = req.body as { description?: string };
  if (!description || description.trim().length < 5) {
    res.status(400).json({ error: "description is required (min 5 chars)" });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MINI_MODEL,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a music vibe translator. Convert a user's mood/vibe description into structured Suno.ai generation settings. Return a JSON object with exactly these fields:
- "genres": string[] — array of 1–3 genre names that match the vibe
- "moods": string[] — array of 2–4 mood tags (e.g. Melancholic, Hopeful, Serene)
- "energy": string — one of: very chill, chill, medium, high, intense
- "tempo": string — one of: ballad, slow, mid, groove, uptempo, fast, hyper
- "era": string — most fitting era (50s/60s/70s/80s/90s/2000s/2010s/modern)
- "instruments": string[] — array of 2–4 instruments that fit the vibe
- "primaryGenre": string — the single most fitting genre
- "reasoning": string — brief explanation (max 60 words) of your mapping choices`,
        },
        {
          role: "user",
          content: `Vibe description: "${description.slice(0, 500)}"`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (err) {
    console.error("[mood-to-settings] error:", err);
    res.status(500).json({ error: "Mood translation failed" });
  }
});

/**
 * GET /api/deezer-preview?url=...
 * Returns title, artist, BPM, album, and thumbnail for a Deezer track URL.
 * Uses Deezer's free public API — no authentication required.
 */
router.get("/deezer-preview", async (req, res) => {
  const url = (req.query.url as string ?? "").trim();
  if (!url || !isDeezerUrl(url)) {
    res.status(400).json({ error: "Provide a valid Deezer track URL (deezer.com/track/...)" });
    return;
  }

  const trackId = deezerTrackIdFromUrl(url);
  if (!trackId) {
    res.status(400).json({ error: "Could not extract Deezer track ID from URL." });
    return;
  }

  try {
    const resp = await fetch(`https://api.deezer.com/track/${trackId}`, {
      headers: { "User-Agent": "SunoTemplateGenerator/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`Deezer API ${resp.status}`);

    const track = await resp.json() as {
      title?: string; duration?: number; bpm?: number; release_date?: string;
      artist?: { name?: string; picture_medium?: string };
      album?: { title?: string; cover_medium?: string; release_date?: string };
      error?: { message?: string };
    };

    if (track.error) {
      res.status(404).json({ error: track.error.message ?? "Track not found" });
      return;
    }

    const { cleanTitle, cleanArtist } = cleanSongTitle(
      `${track.artist?.name ?? ""} - ${track.title ?? ""}`,
      track.artist?.name ?? ""
    );

    res.json({
      title: track.title ?? "",
      cleanTitle,
      author: track.artist?.name ?? "",
      cleanArtist,
      thumbnail: track.album?.cover_medium ?? null,
      duration: track.duration ? formatDuration(track.duration) : null,
      bpm: track.bpm && track.bpm > 40 ? Math.round(track.bpm) : null,
      album: track.album?.title ?? null,
      releaseYear: (track.release_date ?? track.album?.release_date)?.slice(0, 4) ?? null,
    });
  } catch (err) {
    console.error("[deezer-preview] error:", (err as Error).message);
    res.status(500).json({ error: "Could not fetch Deezer track info." });
  }
});

/**
 * POST /api/compare
 * Compares two tracks (YouTube or Deezer) side-by-side.
 * Returns metadata for both + a "blend" prompt suggestion.
 */
router.post("/compare", async (req, res) => {
  const { urlA, urlB } = req.body as { urlA?: string; urlB?: string };
  if (!urlA || !urlB) {
    res.status(400).json({ error: "urlA and urlB are required" });
    return;
  }
  if (!isValidSourceUrl(urlA) || !isValidSourceUrl(urlB)) {
    res.status(400).json({ error: "Both URLs must be valid YouTube or Deezer links" });
    return;
  }

  try {
    const [resultA, resultB] = await Promise.allSettled([
      fetchAllMetadata(urlA),
      fetchAllMetadata(urlB),
    ]);

    const metaA = resultA.status === "fulfilled" ? resultA.value : null;
    const metaB = resultB.status === "fulfilled" ? resultB.value : null;

    if (!metaA || !metaB) {
      res.status(500).json({ error: "Could not fetch metadata for one or both tracks" });
      return;
    }

    const summarise = (m: VideoMetadata) => ({
      title: m.cleanTitle,
      artist: m.cleanArtist,
      bpm: m.audioFeatures?.bpm ?? null,
      key: m.audioFeatures?.key ?? null,
      genres: m.musicBrainz?.genres ?? [],
      releaseYear: m.musicBrainz?.releaseYear ?? m.descriptionData?.releaseYear ?? null,
      language: m.language ?? "English",
      lyricsAvailable: !!m.lyricsText,
    });

    // Ask the mini model for a blend suggestion
    const blendPrompt = `Track A: "${metaA.cleanArtist} – ${metaA.cleanTitle}" (${metaA.audioFeatures?.bpm ?? "?"} BPM, ${metaA.audioFeatures?.key ?? "?"}, genres: ${metaA.musicBrainz?.genres?.slice(0,3).join(", ") || "unknown"})
Track B: "${metaB.cleanArtist} – ${metaB.cleanTitle}" (${metaB.audioFeatures?.bpm ?? "?"} BPM, ${metaB.audioFeatures?.key ?? "?"}, genres: ${metaB.musicBrainz?.genres?.slice(0,3).join(", ") || "unknown"})

Write a single paragraph (max 120 words) describing how to blend the production style of Track A with the vocal/melodic approach of Track B into a unique Suno template. Be concrete: mention specific BPM, key, instruments, and production techniques from each track.`;

    const blendCompletion = await openai.chat.completions.create({
      model: AI_MINI_MODEL,
      max_tokens: 200,
      messages: [
        { role: "system", content: "You are a music production expert. Write concise, actionable Suno prompt guidance." },
        { role: "user", content: blendPrompt },
      ],
    });

    res.json({
      trackA: summarise(metaA),
      trackB: summarise(metaB),
      blendSuggestion: blendCompletion.choices[0]?.message?.content?.trim() ?? null,
    });
  } catch (err) {
    console.error("[compare] error:", err);
    res.status(500).json({ error: "Comparison failed" });
  }
});

/**
 * POST /api/quality-score
 * Uses the AI mini model to produce a short quality assessment of a generated template.
 * Returns a score (0–100) and a one-sentence improvement tip.
 */
router.post("/quality-score", async (req, res) => {
  const { styleOfMusic, lyrics, negativePrompt } = req.body as {
    styleOfMusic?: string; lyrics?: string; negativePrompt?: string;
  };

  if (!styleOfMusic || !lyrics) {
    res.status(400).json({ error: "styleOfMusic and lyrics are required" });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MINI_MODEL,
      max_tokens: 180,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Suno.ai prompt quality judge. Evaluate the given Suno template and return a JSON object with:
- "score": number 0–100 representing overall prompt quality for Suno
- "tip": string — one specific, actionable improvement (max 25 words)
- "strength": string — the single strongest element of this template (max 20 words)
Score rubric: 90–100=exceptional, 75–89=good, 60–74=decent, <60=needs work.`,
        },
        {
          role: "user",
          content: `STYLE:\n${styleOfMusic.slice(0, 999)}\n\nLYRICS (first 800 chars):\n${lyrics.slice(0, 800)}\n\nNEGATIVE:\n${(negativePrompt ?? "").slice(0, 199)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { score?: number; tip?: string; strength?: string };
    res.json({
      score: typeof parsed.score === "number" ? Math.min(100, Math.max(0, parsed.score)) : null,
      tip: parsed.tip ?? null,
      strength: parsed.strength ?? null,
    });
  } catch (err) {
    console.error("[quality-score] error:", err);
    res.status(500).json({ error: "Quality scoring failed" });
  }
});

export default router;
