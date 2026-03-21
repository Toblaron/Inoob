import { Router, type IRouter } from "express";
import { GenerateSunoTemplateBody, GenerateSunoTemplateResponse } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import ytdl from "@distube/ytdl-core";

const router: IRouter = Router();

interface VideoMetadata {
  title: string;
  author: string;
  description: string;
  keywords: string[];
  category: string;
  duration: string;
  /** Raw captions/transcript from YouTube */
  captionText: string | null;
  /** Authentic lyrics from a lyrics API */
  lyricsText: string | null;
  /** Cleaned song title (without YouTube suffixes) for API searches */
  cleanTitle: string;
  /** Cleaned artist name for API searches */
  cleanArtist: string;
  lyricsSource: "api" | "captions" | "none";
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

async function fetchViaOembed(url: string): Promise<VideoMetadata> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetch(oembedUrl);
  if (!response.ok) {
    throw new Error("Could not fetch video metadata via oEmbed.");
  }
  const data = await response.json() as { title: string; author_name: string };
  const { cleanTitle, cleanArtist } = cleanSongTitle(data.title, data.author_name);
  return {
    title: data.title,
    author: data.author_name,
    description: "",
    keywords: [],
    category: "",
    duration: "",
    captionText: null,
    lyricsText: null,
    cleanTitle,
    cleanArtist,
    lyricsSource: "none",
  };
}

async function fetchYouTubeMetadata(url: string): Promise<VideoMetadata> {
  let baseMetadata: Omit<VideoMetadata, "lyricsText" | "lyricsSource">;

  try {
    const info = await ytdl.getInfo(url);
    const details = info.videoDetails;
    const durationSec = parseInt(details.lengthSeconds, 10);
    const captionText = await fetchCaptions(info);
    const { cleanTitle, cleanArtist } = cleanSongTitle(details.title, details.author.name);

    baseMetadata = {
      title: details.title,
      author: details.author.name,
      description: details.description ?? "",
      keywords: details.keywords ?? [],
      category: (details as unknown as { category?: string }).category ?? "",
      duration: formatDuration(durationSec),
      captionText,
      cleanTitle,
      cleanArtist,
    };
  } catch (ytdlErr) {
    console.warn("ytdl-core failed, falling back to oEmbed:", ytdlErr);
    const oembed = await fetchViaOembed(url);
    return oembed;
  }

  // Try to get authentic lyrics from lyrics.ovh API
  console.log(`Fetching lyrics for: "${baseMetadata.cleanArtist}" - "${baseMetadata.cleanTitle}"`);
  const lyricsText = await fetchLyricsFromAPI(baseMetadata.cleanArtist, baseMetadata.cleanTitle);

  if (lyricsText) {
    console.log(`Lyrics found via API (${lyricsText.length} chars)`);
    return { ...baseMetadata, lyricsText, lyricsSource: "api" };
  }

  if (baseMetadata.captionText) {
    console.log(`No API lyrics found, using YouTube captions (${baseMetadata.captionText.length} chars)`);
    return { ...baseMetadata, lyricsText: null, lyricsSource: "captions" };
  }

  console.log("No lyrics or captions found, relying on AI knowledge");
  return { ...baseMetadata, lyricsText: null, lyricsSource: "none" };
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

  parts.push(`Song: "${metadata.title}"`);
  parts.push(`Artist/Channel: ${metadata.author}`);
  parts.push(`Cleaned Title (for template): "${metadata.cleanTitle}"`);
  parts.push(`Cleaned Artist (for template): "${metadata.cleanArtist}"`);
  if (metadata.duration) parts.push(`Duration: ${metadata.duration}`);
  if (metadata.category) parts.push(`YouTube Category: ${metadata.category}`);
  if (metadata.keywords.length > 0) {
    parts.push(`YouTube Tags: ${metadata.keywords.join(", ")}`);
  }
  if (metadata.description) {
    const desc = metadata.description.length > 1500
      ? metadata.description.slice(0, 1500) + "..."
      : metadata.description;
    parts.push(`Video Description:\n${desc}`);
  }

  // Lyrics take priority: API lyrics > captions > nothing
  if (metadata.lyricsSource === "api" && metadata.lyricsText) {
    const lyrics = metadata.lyricsText.length > 5000
      ? metadata.lyricsText.slice(0, 5000) + "\n[... lyrics truncated ...]"
      : metadata.lyricsText;
    parts.push(`AUTHENTIC LYRICS (from lyrics database — use these verbatim):\n${lyrics}`);
  } else if (metadata.lyricsSource === "captions" && metadata.captionText) {
    const captions = metadata.captionText.length > 4000
      ? metadata.captionText.slice(0, 4000) + "..."
      : metadata.captionText;
    parts.push(`YouTube Captions/Transcript (approximate lyrics — clean up errors):\n${captions}`);
  }

  return parts.join("\n\n");
}

const SYSTEM_PROMPT = `You are an expert Suno.ai prompt engineer. You generate professional three-section templates for Suno.ai that produce high-quality AI music generations. You will be given rich metadata about a YouTube song and must produce an accurate, detailed template.

OUTPUT FORMAT: Respond with valid JSON containing exactly these four fields:
{
  "styleOfMusic": "...",
  "title": "...",
  "lyrics": "...",
  "negativePrompt": "..."
}

=== SECTION 1: styleOfMusic (~900 chars) ===
The Suno "Style of Music" field. Rules:
- Capitalization hierarchy: PRIMARY GENRE IN ALL CAPS, Secondary Genre In Title Case, tertiary descriptors in lowercase
- Start with year/era, then primary genre, sub-genres, BPM, key, then production/instrument details
- Include: era, genre hierarchy, BPM, musical key, vocal style (male/female/falsetto/raspy/etc), key instruments with specific descriptions, production techniques, mood, atmosphere, spatial/mixing details
- Target ~900 characters. Be dense and specific.
- Example format: "1987, DANCE-POP, Hi-NRG, Stock Aitken Waterman Production, 113 BPM, B minor, warm baritone male lead with soulful phrasing, bright gated reverb snare, punchy four-on-the-floor kick, syncopated bassline, shimmering DX7 synth stabs, catchy pop hooks, analog warmth, club-friendly, radio-polished production"

=== SECTION 2: lyrics (~5000 chars, target 4900-4999) ===
The Suno "Lyrics" field. This is a FULL PRODUCTION METADATA + LYRICS block.

HEADER BLOCK (production metadata, always first — before any lyrics):
[Produced by AI - Song Genre Description]
[Mix: describe stereo field, frequency zones, panning]
[Synthesis: list all key synths/instruments and their roles]
[Modulation: LFO rates, envelope followers, macros]
[Rhythm: BPM, swing amounts, groove pattern description]
[Spatial: reverb type and time, delay type and sync, stereo width]
[Dynamics: compression ratios, sidechain, saturation]
[Master: glue compression, EQ, limiter ceiling]
[Key: musical key]
[BPM: exact BPM]

LYRICS HANDLING — depends on what was provided:

IF "AUTHENTIC LYRICS" are provided in context:
- These are the REAL lyrics from a professional database. Use them verbatim — do not paraphrase or invent.
- Structure them with Suno section markers: [Intro - description], [Verse 1 - description], [Pre-Chorus - description], [Chorus - description], [Verse 2 - description], [Bridge - description], [Outro - description]
- After each section header, add 2-3 production direction lines in square brackets, then the actual lyric lines, then 1-2 parenthetical performance lines
- Example of a correctly formatted verse:
  [Verse 1 - tight groove, synth stabs, held-back energy]
  [bass holds root, hat 16ths, synth stabs offbeats]
  [vocal dry and forward, plate reverb 1.2s at -18dB]
  We're no strangers to love
  You know the rules and so do I
  (confident and sincere, no affectation)

IF "YouTube Captions/Transcript" are provided:
- These are approximate auto-generated captions. Clean them up (fix obvious errors, proper capitalization) and structure them with section markers.
- Fill in any missing parts using your knowledge of the song.

IF neither is provided:
- Use your knowledge of the song to write accurate lyrics, or write thematic placeholder lyrics capturing the mood.

Bracket conventions in lyrics:
- Square brackets [ ] = structural markers and production/instrument directions  
- Parentheses ( ) = performance feel and emotional directions
- Actual lyric lines = plain text (no brackets)

Target 4900-4999 characters total. Write enough sections and detail to reach the target.

=== SECTION 3: negativePrompt (150-200 chars) ===
What Suno should NOT generate. Rules:
- Comma-separated, NO spaces after commas
- List genres, instruments, styles, vocal types that clash with this song
- Target 150-200 characters exactly
- Example: "generic,lo-fi,acoustic guitar,country,jazz improvisation,spoken word,rap vocals,orchestral strings,piano ballad,choir,happy pop,reggae,folk,ukulele,clean electric guitar"

=== QUALITY RULES ===
- No asterisks (*) anywhere in output
- Pure English only
- No banned themes: no cyberpunk, neon, ghost-in-machine, tech metaphors
- No placeholder text or [INSERT X HERE] patterns
- Every detail should be specific and music-production accurate
- The "title" field should be a clean, creative Suno title like "Never Gonna Give You Up (1987 Hi-NRG Reimagining)"`;

router.post("/generate-template", async (req, res) => {
  try {
    const parsed = GenerateSunoTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body. Please provide a youtubeUrl." });
      return;
    }

    const { youtubeUrl } = parsed.data;

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

    const context = buildPromptContext(metadata);

    const lyricsInstruction =
      metadata.lyricsSource === "api"
        ? "AUTHENTIC LYRICS from a professional database are provided — use them VERBATIM, structured with Suno metatags."
        : metadata.lyricsSource === "captions"
          ? "YouTube captions (approximate) are provided — clean them up and structure with Suno metatags."
          : "No lyrics source available — use your knowledge of this song or write thematic placeholder lyrics.";

    const userMessage = `Create a Suno.ai template for this song. ${lyricsInstruction}

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
      styleOfMusic: aiResult.styleOfMusic,
      title: aiResult.title,
      lyrics: aiResult.lyrics,
      negativePrompt: aiResult.negativePrompt,
      tags: [],
    });

    res.json(template);
  } catch (err: unknown) {
    console.error("Error generating template:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    res.status(500).json({ error: message });
  }
});

export default router;
