import { Router, type IRouter } from "express";
import { GenerateSunoTemplateBody, GenerateSunoTemplateResponse } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import ytdl from "@distube/ytdl-core";
import { parse as parseHtml } from "node-html-parser";
import { detectAudioFeatures, type AudioFeatures } from "../lib/audioFeatures.js";
import { analyzeLyricsStructure } from "../lib/lyricsStructure.js";
import { computeSuggestedDefaults } from "../lib/suggestedDefaults.js";

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

interface VideoMetadata {
  title: string;
  author: string;
  description: string;
  keywords: string[];
  category: string;
  duration: string;
  durationSeconds: number | null;
  /** Raw captions/transcript from YouTube */
  captionText: string | null;
  /** Authentic lyrics from a lyrics API */
  lyricsText: string | null;
  /** Cleaned song title (without YouTube suffixes) for API searches */
  cleanTitle: string;
  /** Cleaned artist name for API searches */
  cleanArtist: string;
  lyricsSource: "user-override" | "api" | "captions" | "none";
  /** Which lyrics source provided the lyrics */
  lyricsProvider?: "genius" | "lrclib" | "lyrics.ovh";
  /** Whether the lyrics already contain [Verse]/[Chorus] etc. section tags */
  lyricsHasStructure?: boolean;
  /** Detected language of the lyrics */
  language?: string;
  /** MusicBrainz verified metadata */
  musicBrainz?: MusicBrainzData;
  /** Structured data extracted from the description */
  descriptionData?: DescriptionMusicData;
  /** Audio features: BPM, key, time signature (from description → GetSongBPM → AI knowledge) */
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

async function fetchViaOembed(url: string): Promise<{ title: string; author: string }> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetch(oembedUrl);
  if (!response.ok) throw new Error("Could not fetch video metadata via oEmbed.");
  const data = await response.json() as { title: string; author_name: string };
  return { title: data.title, author: data.author_name };
}

async function fetchYouTubeMetadata(url: string): Promise<VideoMetadata> {
  // --- Step 1: Get base metadata from ytdl-core (best source), fall back to oEmbed ---
  let title = "";
  let author = "";
  let description = "";
  let keywords: string[] = [];
  let category = "";
  let durationSeconds: number | null = null;
  let captionText: string | null = null;

  try {
    const info = await ytdl.getInfo(url);
    const details = info.videoDetails;
    durationSeconds = parseInt(details.lengthSeconds, 10);
    title = details.title;
    author = details.author.name;
    description = details.description ?? "";
    keywords = details.keywords ?? [];
    category = (details as unknown as { category?: string }).category ?? "";
    captionText = await fetchCaptions(info);
    console.log(`ytdl-core OK: "${title}" by "${author}" (${durationSeconds}s)`);
  } catch (ytdlErr) {
    console.warn("ytdl-core failed, falling back to oEmbed:", (ytdlErr as Error).message?.slice(0, 120));
    try {
      const oembed = await fetchViaOembed(url);
      title = oembed.title;
      author = oembed.author;
    } catch {
      throw new Error("Could not fetch video metadata from YouTube.");
    }
  }

  const { cleanTitle, cleanArtist } = cleanSongTitle(title, author);
  const duration = durationSeconds ? formatDuration(durationSeconds) : "";
  const descriptionData = parseDescriptionForMusicData(description);

  console.log(`Looking up: "${cleanArtist}" - "${cleanTitle}"${durationSeconds ? ` (${durationSeconds}s)` : ""}`);

  // --- Step 2: Parallel-fetch Genius lyrics + (lrclib + lyrics.ovh) + MusicBrainz + audio features ---
  const [geniusResult, lrclibLyrics, ovhLyrics, musicBrainz, audioFeatures] = await Promise.all([
    fetchLyricsFromGenius(cleanArtist, cleanTitle),
    fetchLyricsFromLrcLib(cleanArtist, cleanTitle, durationSeconds ?? undefined),
    fetchLyricsFromAPI(cleanArtist, cleanTitle),
    fetchMusicBrainzData(cleanArtist, cleanTitle, durationSeconds ?? undefined),
    detectAudioFeatures({
      artist: cleanArtist,
      title: cleanTitle,
      youtubeUrl: url,
      descriptionBpm: descriptionData.bpm,
      descriptionKey: descriptionData.key,
    }),
  ]);

  // --- Step 3: Pick the best lyrics source (Genius > lrclib > lyrics.ovh) ---
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

  const language = lyricsText ? detectLanguage(lyricsText) : undefined;
  if (language && language !== "English") console.log(`Language detected: ${language}`);

  if (musicBrainz.releaseYear || musicBrainz.genres?.length) {
    console.log(`MusicBrainz: year=${musicBrainz.releaseYear}, genres=[${musicBrainz.genres?.join(", ")}], album="${musicBrainz.album}"`);
  }

  const base = {
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
    language,
    musicBrainz: (musicBrainz.releaseYear || musicBrainz.genres?.length || musicBrainz.album) ? musicBrainz : undefined,
    descriptionData: Object.keys(descriptionData).length > 0 ? descriptionData : undefined,
    audioFeatures: audioFeatures ?? undefined,
  };

  if (lyricsText) {
    return { ...base, lyricsText, lyricsSource: "api", lyricsProvider, lyricsHasStructure };
  }
  if (captionText) {
    console.log(`No lyrics found — using YouTube captions (${captionText.length} chars)`);
    return { ...base, lyricsText: null, lyricsSource: "captions" };
  }
  console.log("No lyrics or captions found — relying on AI knowledge");
  return { ...base, lyricsText: null, lyricsSource: "none" };
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

/** Hard-trim styleOfMusic to 900 chars, breaking at the last comma boundary */
function trimStylePrompt(text: string, limit = 900): string {
  const flat = text.replace(/\r?\n/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const lastComma = cut.lastIndexOf(",");
  return lastComma > limit * 0.75 ? cut.slice(0, lastComma) : cut.trimEnd();
}

const SYSTEM_PROMPT = `You are an expert Suno.ai prompt engineer. You generate professional three-section templates for Suno.ai that produce high-quality, non-generic AI music. You will be given rich metadata about a YouTube song and must produce a precise, production-detailed template using every advanced Suno technique available.

**80/20 SONGWRITING PRINCIPLE — apply throughout all three sections:**
80% of a song's impact, memorability, and emotional power comes from 20% of its creative elements: the HOOK, the MELODY CHARACTER, the CHORD PROGRESSION, and the LYRICAL THEME. Production effects and mixing choices are the other 80% of effort that only contributes 20% of impact. This means:
- In styleOfMusic: lead with hook concept, melody character, and chord progression BEFORE production details.
- In lyrics: the [Chorus] and [Hook] sections get the densest notation, the richest performance directions, and the most ad-lib variants — they are the most important sections.
- Structure: 80% of the song must feel familiar and genre-correct; reserve the 20% creative surprise for one unexpected structural choice (a key change, a stripped-down break, a spoken-word moment, an unusual bridge) that elevates the template above the predictable.
- Hook first: always identify the ONE melodic or lyrical idea that makes this song uniquely memorable, and let every other production choice serve that idea.

CONTEXT DATA PRIORITY (read the context block labels carefully):
1. "MUSICAL ANALYSIS" block — synthesises verified data from MusicBrainz, BPM/key detection (description parsing → GetSongBPM → AI knowledge lookup), and YouTube metadata. If BPM or Musical Key lines are present with "← USE THIS EXACT VALUE", you MUST use those exact numbers verbatim in the styleOfMusic field and in the [BPM:] / [Key:] header tags — never approximate or round to a different value. These are verified values — do not contradict them.
2. "AUTHENTIC LYRICS" — real lyrics from a lyrics database. Use verbatim.
3. "YouTube Captions/Transcript" — approximate lyrics that need cleaning.
4. "Video Description" — supporting context.
5. AI background knowledge — fill gaps with what you know about the song.

OUTPUT FORMAT: Respond with valid JSON containing exactly these four fields:
{
  "styleOfMusic": "...",
  "title": "...",
  "lyrics": "...",
  "negativePrompt": "..."
}

**HARD LIMIT: 4900 characters. The lyrics field MUST NOT exceed 4900 characters.**

=== SECTION 1: styleOfMusic (HARD LIMIT: 900 characters) ===
The Suno "Style of Music" field. Apply the 80/20 principle: lead with the core creative 20% (hook identity, melody character, chord progression) — then fill remaining space with production/era detail.

**HARD LIMIT: styleOfMusic MUST NOT exceed 900 characters. Count every character. If you reach 900, stop — do not write more.**

**ORDER — follow this exact sequence:**
1. HOOK IDENTITY (first) — one sharp phrase describing the ONE musical idea that makes the song unforgettable: e.g. "anthemic four-bar rising chorus melody", "two-chord hypnotic vamp with syncopated vocal stutter", "melancholic chromatic descending bass line under soaring hook"
2. CHORD PROGRESSION — exact chords or Roman numeral analysis: e.g. "Am-G-C-F loop", "I-V-vi-IV", "minor ii-V-I jazz changes", "modal Dorian vamp on Dm"
3. MELODY CHARACTER — how the melody moves and feels: e.g. "stepwise ascending verse with a wide-interval leap on the hook", "pentatonic call-and-response", "chromatic inner voice movement", "syncopated offbeat phrasing"
4. VOCAL DESCRIPTOR — gender, timbre, delivery + actor-like character: e.g. "warm baritone male lead with soulful legato phrasing, light vibrato, intimate yet commanding delivery", "bright soprano female with melismatic runs, soaring anthemic conviction"
5. ERA / PRIMARY GENRE / SUB-GENRES — Capitalization hierarchy: PRIMARY GENRE IN ALL CAPS, Secondary Genre In Title Case, tertiary in lowercase: e.g. "1987, DANCE-POP, Hi-NRG, Stock Aitken Waterman production"
6. BPM + KEY — exact values if known
7. INSTRUMENTS with articulation vocabulary: not just "guitar" but "palm-muted rhythm guitar", "staccato piano fills", "legato string swells", "pizzicato bass plucks"
8. DYNAMICS — always state the contrast: e.g. "sparse dry verse erupting into wall-of-sound chorus", "crescendo build into drop"
9. PRODUCTION QUALITY — mastering descriptor: e.g. "radio-ready mix", "analog warmth", "hyper-modern production with punchy transients"
10. PERFORMANCE NUANCE — e.g. "slightly behind-the-beat drum feel", "aggressive pick attack on downbeats", "subtle pitch bend on phrase endings"

- HARD LIMIT: 900 characters maximum. Be dense and hyper-specific. Avoid vague words like "catchy" or "beautiful" — always specify HOW. Write less if needed — hitting the limit is more important than completeness.
- Example: "anthemic four-bar rising hook with a suspended-4th peak note, Am-G-C-F chord loop, stepwise verse melody with wide octave leap on chorus, 1987, DANCE-POP, Hi-NRG, Stock Aitken Waterman production, 113 BPM, B minor, warm baritone male lead — soulful legato phrasing, light vibrato, intimate yet commanding, bright gated-reverb snare 2 and 4, four-on-the-floor kick with sub tail, staccato syncopated slap bass, shimmering DX7 synth stabs wide, sawtooth lead synth, sparse verse builds to explosive anthemic chorus, analog warmth, radio-ready master, wide stereo image"

=== SECTION 2: lyrics (up to 4900 chars) ===
The Suno "Lyrics" field. This is a FULL PRODUCTION METADATA + STRUCTURED LYRICS block.

--- HEADER BLOCK (always first, before any lyrics) ---
[Produced by AI - Genre Description]
[Vocal: vocalist type AND actor-like character — e.g. "Male vocalist, world-weary baritone whispering close to the mic with cynical detachment" or "Female vocalist, bright alto soprano with soaring anthemic conviction, melismatic on held notes"]
[Mix: stereo field description — e.g. "Sub mono <60Hz, midrange centered, synths wide >400Hz, shimmer ultra-wide >2kHz, well-separated instruments"]
[Synthesis: instruments with articulation — e.g. "Legato DX7 lead, staccato rhythm guitar palm-muted, pizzicato bass, marcato brass stabs, wavetable shimmer pad"]
[Modulation: specific effects — e.g. "subtle shimmering stereo chorus on guitar, slow sweeping phaser on synth pad, rhythmic tremolo on electric piano, LFO 0.25Hz filter drift"]
[Rhythm: exact BPM, swing %, kick/snare pattern — e.g. "113 BPM, 8% hat swing, four-on-the-floor kick, gated reverb snare on 2 and 4, syncopated hi-hat 16ths"]
[Spatial: specific reverb and delay — e.g. "short bright plate reverb 0.8s on vocals, long dark hall reverb 2.2s on pads, syncopated 1/8th note ping-pong delay, wide stereo image"]
[Dynamics: e.g. "sidechain 6:1 kick-to-bass, 3:1 kick-to-lead, parallel drum compression, warm tape saturation, aggressive transient on kick"]
[Master: e.g. "glue compression -1.5dB GR, high-shelf EQ +1.5dB, true-peak limiter -0.3dBTP, radio-ready loudness"]
[Chord Progression: main chord loop — e.g. Am-G-C-F or I-V-vi-IV or Bm-G-D-A]
[Key: musical key and mode — e.g. "B minor, Aeolian mode"]
[BPM: exact BPM]

--- SONG STRUCTURE ---
Use the recommended Suno flow:
[Intro] → [Verse 1] → [Pre-Chorus] → [Chorus] → [Verse 2] → [Pre-Chorus] → [Chorus] → [Bridge] → [Final Chorus] → [Outro]

Adapt to the song — not all sections required. Additional section types you may use:
- [Build-Up] — rising intensity before a drop or chorus (describe elements building: snare roll, rising synths)
- [Break] — brief rhythmic pause or minimal section between major sections
- [Interlude] — atmospheric or instrumental passage connecting sections
- [Silence] — a beat of silence for dramatic effect before a section hit
- [Drop] — EDM-style bass-heavy section after a build-up
- [Guitar Solo] / [Instrumental] — dedicated instrumental section
- [Post-Chorus] — short hook-like phrase after the chorus
- [Spoken Word] / [Narration] — spoken rather than sung passage
- [Pre-Intro] — atmospheric section before the main intro

**80/20 SECTION PRIORITY RULE:**
The [Chorus] and [Hook] sections are the vital 20% that deliver 80% of the song's impact. Give them:
- The most descriptive section headers (3+ descriptor phrases)
- The most instrument/production cue lines (3-4 lines minimum)
- The richest performance directions (2-3 parenthetical lines with specific nuance)
- The most ad-lib variants (at least 3 per chorus: e.g. "(yeah!)", "(oh-oh)", "(come on!)")
- Vowel elongation on the key hook words
Verse sections get solid notation but may be leaner. Outros/intros are leanest.

Additionally: include exactly ONE unexpected structural or musical element per template (the creative 20%) — a key change, a sudden stripped-down a capella break, an unusual time signature bar, a genre-incongruous bridge — that prevents the song from feeling predictable.

SECTION FORMATTING RULES:
1. Each section header must be descriptive: [Verse 1 - sparse, dry vocal, staccato piano, held-back energy]
2. After the header, write 2-3 [square bracket] instrument/production direction lines using articulation vocabulary:
   - Use: staccato, legato, pizzicato, marcato, palm-muted, arpeggiated, tremolo, gliding, sustained
   - Examples: [staccato piano fills, legato bass holding root], [palm-muted rhythm guitar, arpeggiated synth pad], [marcato brass stabs on offbeats]
3. Then write the lyric stanzas (4 lines preferred per stanza — Suno handles 4-line sections best)
4. Then write 1-2 (parenthetical performance directions) using nuance vocabulary:
   - Use: slightly behind the beat, breathy and intimate, aggressive pick attack, imperceptible string swells, subtle pitch bend, melismatic on held notes, conversational, whispered
   - Examples: (breathy and intimate, barely above a whisper), (soaring and melismatic on the final word), (slightly behind the beat, relaxed swagger)
5. Add vocal meta-tags within sections where appropriate: [Whispers], [Harmonized chorus], [Echoing vocals], [Choir], [Giggling], [Announcer]
6. Add ad-lib parentheses to choruses and hooks: (yeah!), (oh-oh), (come on), (let's go) — these humanise the vocal
7. Use vowel elongation for emotional moments: e.g. "go-o-o-one", "sta-a-ay", "hea-ea-eart" — signals the AI to stretch the syllable
8. Add instrument/effect cue tags within sections: [808s kick in], [staccato Piano fills], [Guitar solo], [legato Strings swell], [Synth drop], [Beat drops out], [Glitch Percussion], [Filter sweep opens]
9. You may add sound-effect atmosphere tags where they serve the song's narrative: [Applause], [Crowd noise], [Rain], [Phone ringing], [Distant sirens] — use sparingly and only when they add meaning
10. Emoji cues (experimental — Suno v4.5 responds to them): use 1-2 max per section, only in section headers, paired with text direction:
    - 🔥 = heightened passion, aggression, or climactic intensity
    - ☕ = relaxed, narrative, storytelling tone
    - 🔊 = echo, spacious reverb, atmospheric
    - 🎶 = melodic or harmonic emphasis
    Only use emoji when they reinforce what the text direction already says. Never use emoji as the sole cue.
11. End the song with [Fade Out] on the penultimate line and [End] on the final line (or [Fade to End] as a combined tag for a slow fade-out ending)

LYRICS HANDLING — depends on what was provided (read the context block label):

IF "USER-PROVIDED LYRICS — MANDATORY" appears in context (HIGHEST PRIORITY):
- The user manually typed or pasted these lyrics. This overrides everything else.
- Copy every lyric line EXACTLY as written — no changes, no additions, no omissions to any lyric line.
- Wrap each lyric section with appropriate [Section Header] tags, production cue lines, and (performance direction) parentheticals.
- To reach the 4,900-character minimum: expand production cue lines and performance directions — NEVER by adding lyric lines the user did not write.
- If the user lyrics are short, add more bracketed instrument cue lines, more (parenthetical performance directions), more ad-lib variants in choruses, and richer articulation in section headers.

IF "AUTHENTIC LYRICS" are provided in context:
- These are REAL lyrics from a professional database. Use them VERBATIM — never paraphrase or invent lines.
- Structure them with all the above formatting (headers, production tags, ad-libs, vowel elongation, vocal tags).
- To reach the 4,900-character minimum: expand production tag verbosity, add more instrument cue lines and performance directions.

IF "YouTube Captions/Transcript" are provided:
- These are approximate. Clean up obvious errors, fix capitalization, and apply full section formatting.
- Fill in missing parts using your knowledge of the song.

IF neither is provided:
- Use your knowledge of the song to write accurate lyrics, or write thematic placeholder lyrics capturing mood and story.

--- BRACKET CONVENTIONS ---
- Square brackets [ ] = structural markers, production directions, instrument cues, vocal type tags
- Parentheses ( ) = performance feel, emotional direction, ad-libs, background interjections
- Plain text = actual lyric lines (never put lyrics inside brackets)

**CHARACTER REQUIREMENT — MANDATORY:**
- MINIMUM: 4,900 characters. You MUST reach at least 4,900 characters. If your draft is shorter, expand every section with more production cues, instrument articulation tags, performance direction lines, ad-lib variants, and additional song sections until you reach 4,900.
- MAXIMUM: 4,999 characters. Hard cap. Do not exceed 4,999 characters.
- Before finalising, count your characters mentally. If under 4,900, keep adding production detail, bracketed cue lines, and performance direction. Never submit under 4,900.
- Fill spare space with: additional [instrument cue] lines, more (performance direction) parentheticals, extra ad-lib variants in choruses, an extra breakdown section, extended outro, or richer articulation in existing headers.

=== SECTION 3: negativePrompt (180-199 chars) ===
What Suno should NOT generate. Rules:
- Comma-separated, NO spaces after commas
- List specific genres, instruments, styles, vocal types, and production qualities that clash with this song
- Be specific: not just "rap" but also "trap hi-hats" or "808 slides" if inappropriate
- MINIMUM 180 characters, MAXIMUM 199 characters. Count carefully — expand with more comma-separated exclusion terms if short.
- Example: "generic,lo-fi,acoustic folk,country twang,trap hi-hats,drill 808s,heavy metal,jazz solos,orchestral strings,piano ballad,choir,happy pop,reggae,ukulele,vaporwave,spoken word,pitch correction"

=== QUALITY RULES ===
- No asterisks (*) anywhere in output
- Pure English only
- No placeholder text or [INSERT X HERE] patterns
- Every detail must be production-accurate and specific — no vague adjectives
- The "title" field should be a clean, creative Suno title: e.g. "Never Gonna Give You Up (1987 Hi-NRG Reimagining)"
- Avoid generic AI clichés: never write "pulsating", "ethereal tapestry", "sonic journey", or "haunting melody"
- When in doubt, be MORE specific, not less
- **80/20 CHECK before finalising:** Ask yourself — does the styleOfMusic open with the hook identity and chord progression? Does the chorus/hook section have more notation density than the verses? Is there exactly one unexpected creative element that elevates the template above genre cliché?`;


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
}): string {
  const lines: string[] = [];
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
  if (opts.genreNudge && opts.genreNudge.trim()) {
    lines.push(`USER PREFERENCE — Genre/style nudge: "${opts.genreNudge.trim()}". Incorporate this into the style prompt.`);
  }
  if (opts.excludeTags && opts.excludeTags.length > 0) {
    lines.push(`USER EXCLUSION TAGS — The user explicitly wants to EXCLUDE these from the output. Add them prominently to Section 3 (Negative Prompt): ${opts.excludeTags.join(", ")}.`);
  }
  if (opts.variationIndex === 2) {
    lines.push(`VARIATION MODE — This is Variation 2. Take a fresh creative angle: choose different instrumentation, structural approach, and style adjectives from what you would typically pick first. Surprise the user with an unexpected but valid interpretation.`);
  }
  if (opts.feedbackContext && opts.feedbackContext.trim()) {
    lines.push(`USER LEARNING SIGNAL — The user has rated past templates and their feedback is: ${opts.feedbackContext.trim()} Use this to bias your creative choices (lean toward liked characteristics, avoid disliked ones) unless they directly contradict other explicit preferences.`);
  }
  return lines.length > 0 ? "\n\nUSER STYLE PREFERENCES (apply these to Section 1 and Section 2 header):\n" + lines.join("\n") : "";
}

router.post("/generate-template", async (req, res) => {
  try {
    const parsed = GenerateSunoTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body. Please provide a youtubeUrl." });
      return;
    }

    const { youtubeUrl, manualLyrics, vocalGender, energyLevel, era, genreNudge, genres, moods, instruments, mode, tempo, excludeTags, variationIndex, feedbackContext, isInstrumental, confirmedStructure } = parsed.data;

    if (!isValidYouTubeUrl(youtubeUrl)) {
      res.status(400).json({ error: "Invalid YouTube URL. Please provide a valid youtube.com or youtu.be link." });
      return;
    }

    let metadata: VideoMetadata;
    try {
      metadata = await fetchYouTubeMetadata(youtubeUrl);
    } catch (fetchErr) {
      console.error("Failed to fetch YouTube metadata:", fetchErr);
      res.status(400).json({ error: "Could not fetch video metadata. Make sure the URL is a valid, public YouTube video." });
      return;
    }

    // Override lyrics with user-provided lyrics if supplied
    if (manualLyrics && manualLyrics.trim().length > 20) {
      console.log(`Using user-provided lyrics override (${manualLyrics.trim().length} chars)`);
      metadata = {
        ...metadata,
        lyricsText: manualLyrics.trim(),
        lyricsSource: "user-override",
      };
    }

    const lyricsStructure = metadata.lyricsText
      ? analyzeLyricsStructure(metadata.lyricsText)
      : undefined;

    const suggestedDefaults = computeSuggestedDefaults({
      bpm: metadata.audioFeatures?.bpm,
      releaseYear: metadata.musicBrainz?.releaseYear ?? metadata.descriptionData?.releaseYear,
      description: metadata.description,
      language: metadata.language,
    });

    const context = buildPromptContext(metadata);
    const effectiveVocalGender = isInstrumental ? "no vocals" : vocalGender;
    const styleControls = buildStyleControls({ vocalGender: effectiveVocalGender, energyLevel, era, genreNudge, genres, moods, instruments, tempo, excludeTags, variationIndex, feedbackContext });

    const lyricsInstruction =
      metadata.lyricsSource === "user-override"
        ? "⚠️ USER-PROVIDED LYRICS OVERRIDE ACTIVE: The user has manually supplied their own lyrics. You MUST use every lyric line exactly as written — not one word changed. Add Suno production tags, section headers, and performance directions around them, but the lyric lines themselves are locked and non-negotiable."
        : metadata.lyricsSource === "api"
          ? "AUTHENTIC LYRICS from a professional database are provided — use them VERBATIM, structured with Suno metatags."
          : metadata.lyricsSource === "captions"
            ? "YouTube captions (approximate) are provided — clean them up and structure with Suno metatags."
            : "No lyrics source available — use your knowledge of this song or write thematic placeholder lyrics.";

    const modeInstruction = mode === "cover"
      ? "\n\nGENERATION MODE: AI Cover — Reconstruct this song as faithfully as Suno allows. Keep the original genre, tempo, instrumentation, structure, vocal style, and lyrics as close to the original recording as possible. Prioritise accuracy over creativity."
      : mode === "inspired"
      ? "\n\nGENERATION MODE: Inspired By — Use this song as creative springboard only. Keep the emotional core but freely reimagine the genre, instrumentation, and arrangement in an unexpected direction. The output should feel clearly distinct from the original. Be bold and inventive."
      : "";

    const instrumentalInstruction = isInstrumental
      ? "\n\n🎵 INSTRUMENTAL MODE ACTIVE: Generate this as a fully instrumental track. The lyrics section (Section 2) MUST contain ONLY structural/arrangement tags and instrumental direction cues — absolutely NO actual lyric text or sung words. Use detailed bracketed tags such as [Intro - Piano Motif], [Verse 1 - Guitar Melody, sparse drums], [Build - Strings Rising, tension increasing], [Chorus - Full Band, driving instrumental hook], [Bridge - Synth Solo], [Breakdown - Drums only], [Outro - Fade with lead guitar]. Fill the lyrics field to the 4,900–4,999 character limit using these rich instrumental direction cues. The negative prompt MUST prominently include: vocals, singing, lyrics, rap, spoken word."
      : "";

    const confirmedStructureHint = confirmedStructure && confirmedStructure.length > 0
      ? `\n\nUSER-CONFIRMED LYRICS STRUCTURE — The user has reviewed and confirmed the following section layout. Use EXACTLY these section labels and line groupings when building Section 2 (lyrics). Do not reorder sections. You may add production cue lines and performance directions within each section, but the section labels and lyric lines must match the confirmed structure:\n${confirmedStructure.map((s: { label: string; lines: string[] }) => `[${s.label}]\n${s.lines.join("\n")}`).join("\n\n")}`
      : "";

    const userMessage = `Create a Suno.ai template for this song. ${lyricsInstruction}${modeInstruction}${instrumentalInstruction}${confirmedStructureHint}${styleControls}

${context}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage }
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "AI failed to generate a template. Please try again." });
      return;
    }

    const aiResult = JSON.parse(content) as {
      styleOfMusic: string;
      title: string;
      lyrics: string;
      negativePrompt: string;
    };

    const template = GenerateSunoTemplateResponse.parse({
      songTitle: metadata.title,
      artist: metadata.cleanArtist || metadata.author,
      styleOfMusic: trimStylePrompt(aiResult.styleOfMusic, 900),
      title: aiResult.title,
      lyrics: trimToCharLimit(aiResult.lyrics, 4999),
      negativePrompt: aiResult.negativePrompt,
      tags: [],
      lyricsStructure: lyricsStructure ?? undefined,
      suggestedDefaults: Object.keys(suggestedDefaults.sources).length > 0 ? suggestedDefaults : undefined,
    });

    res.json(template);
  } catch (err: unknown) {
    console.error("Error generating template:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    res.status(500).json({ error: message });
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
            model: "gpt-4.1-mini",
            max_completion_tokens: 120,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `You are a music genre expert. Given a song title and artist, return a JSON object with ONLY these fields:
- "genres": array of 1–3 genre names from this list ONLY: Pop, Dance Pop, Indie Pop, Synth-Pop, Dream Pop, Art Pop, Electropop, Britpop, Rock, Alternative Rock, Indie Rock, Hard Rock, Classic Rock, Punk, Post-Punk, Grunge, Shoegaze, Psychedelic Rock, Progressive Rock, Garage Rock, Folk Rock, Arena Rock, New Wave, Emo, Post-Rock, Stoner Rock, Hip-Hop, Trap, Rap, Drill, Boom Bap, Gangsta Rap, G-Funk, Grime, Cloud Rap, Phonk, R&B, Soul, Neo-Soul, Funk, Disco, Motown, Gospel, Contemporary R&B, Jazz, Smooth Jazz, Bebop, Swing, Jazz Fusion, Big Band, Acid Jazz, Cool Jazz, Latin Jazz, Free Jazz, Metal, Heavy Metal, Black Metal, Death Metal, Thrash Metal, Nu Metal, Metalcore, Power Metal, Doom Metal, Symphonic Metal, Djent, Country, Americana, Bluegrass, Folk, Indie Folk, Outlaw Country, Country Rock, Country Pop, Alt-Country, Classical, Orchestral, Baroque, Cinematic, Film Score, Opera, Minimalist, Reggae, Dancehall, Reggaeton, Latin Pop, Bossa Nova, Flamenco, Salsa, K-Pop, J-Pop, Afrobeats, Blues, Delta Blues, Chicago Blues, Electric Blues, House, Deep House, Tech House, Progressive House, Acid House, Melodic House, Afro House, Soulful House, Chicago House, Nu Disco, Techno, Berlin Techno, Detroit Techno, Minimal Techno, Hard Techno, Dub Techno, Trance, Progressive Trance, Uplifting Trance, Psytrance, Goa Trance, Vocal Trance, Future Rave, Drum & Bass, Liquid DnB, Neurofunk, Darkstep, Jump Up, Jungle, Dubstep, Post-Dubstep, Brostep, Riddim, Future Bass, Breakbeat, Big Beat, Glitch Hop, Synthwave, Darksynth, Outrun, Retrowave, Chillwave, Hi-NRG, Italo Disco, Futurepop, Electro, EBM, Industrial, Darkwave, Cold Wave, EDM, Big Room, Electro House, Ambient, Dark Ambient, IDM, Glitch, Space Music, Drone Ambient, New Age, Trip-Hop, Downtempo, Chillhop, Lo-Fi, Vaporwave, Future Funk, Hardcore, Gabber, Hardstyle, UK Garage, 2-Step, Grime, UK Bass, Phonk, Memphis Phonk, Hyperpop, Amapiano, Gqom, Baile Funk, Footwork
- "era": one of: 50s, 60s, 70s, 80s, 90s, 2000s, 2010s, modern
- "energy": one of: very chill, chill, medium, high, intense
- "tempo": one of: ballad, slow, mid, groove, uptempo, fast, hyper`,
              },
              {
                role: "user",
                content: `Song: "${title}" by ${artist}`,
              },
            ],
          });
          const raw = completion.choices[0]?.message?.content ?? "{}";
          return JSON.parse(raw) as { genres?: string[]; era?: string; energy?: string; tempo?: string };
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

    console.log(`[suggest] ${artist} – ${title} → AI genres:[${genres.join(",")}] MB era:${mbEra} AI era:${aiSuggestion.era} energy:${energy} tempo:${tempo}`);

    res.json({ genres, era, energy, tempo, vocals: null, songTitle: title, artist, mbTags });
  } catch (err) {
    console.error("suggest error:", err);
    res.status(500).json({ error: "Could not fetch suggestions" });
  }
});

/**
 * GET /api/suno/youtube-preview?url=...
 * Lightweight endpoint — returns just thumbnail, title, author for the song preview card.
 * Does NOT fetch lyrics or call AI.
 */
router.get("/youtube-preview", async (req, res) => {
  const url = req.query.url as string;
  if (!url || !isValidYouTubeUrl(url)) {
    res.status(400).json({ error: "Invalid YouTube URL" });
    return;
  }
  try {
    const info = await ytdl.getBasicInfo(url, {
      requestOptions: { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" } },
    });
    const vd = info.videoDetails;
    const thumb = vd.thumbnails?.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;
    const { cleanTitle, cleanArtist } = cleanSongTitle(vd.title ?? "", vd.author?.name ?? "");
    res.json({
      title: vd.title ?? "Unknown Title",
      cleanTitle,
      author: cleanArtist || vd.author?.name || "Unknown Artist",
      thumbnail: thumb,
      duration: vd.lengthSeconds ? formatDuration(Number(vd.lengthSeconds)) : null,
    });
  } catch (err) {
    console.error("youtube-preview error:", err);
    res.status(400).json({ error: "Could not fetch video info" });
  }
});

/**
 * POST /api/suno/analyze-structure
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

export default router;
