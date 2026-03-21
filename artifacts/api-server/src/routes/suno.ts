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
  lyricsSource: "user-override" | "api" | "captions" | "none";
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

  // Lyrics take priority: user override > API lyrics > captions > nothing
  if (metadata.lyricsSource === "user-override" && metadata.lyricsText) {
    const lyrics = metadata.lyricsText.length > 5000
      ? metadata.lyricsText.slice(0, 5000) + "\n[... lyrics truncated ...]"
      : metadata.lyricsText;
    parts.push(`USER-PROVIDED LYRICS — MANDATORY: The user has manually supplied these lyrics. Every single lyric line below MUST appear in the output, word-for-word. Do NOT substitute, paraphrase, or invent any lyric lines:\n${lyrics}`);
  } else if (metadata.lyricsSource === "api" && metadata.lyricsText) {
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

function trimToCharLimit(text: string, limit: number): string {
  const normalized = text.replace(/\r\n/g, "\n");
  if (normalized.length <= limit) return normalized;
  const truncated = normalized.slice(0, limit);
  const lastNewline = truncated.lastIndexOf("\n");
  return lastNewline !== -1 ? truncated.slice(0, lastNewline) : "";
}

const SYSTEM_PROMPT = `You are an expert Suno.ai prompt engineer. You generate professional three-section templates for Suno.ai that produce high-quality, non-generic AI music. You will be given rich metadata about a YouTube song and must produce a precise, production-detailed template using every advanced Suno technique available.

OUTPUT FORMAT: Respond with valid JSON containing exactly these four fields:
{
  "styleOfMusic": "...",
  "title": "...",
  "lyrics": "...",
  "negativePrompt": "..."
}

**HARD LIMIT: 4900 characters. The lyrics field MUST NOT exceed 4900 characters.**

=== SECTION 1: styleOfMusic (~900 chars) ===
The Suno "Style of Music" field. Rules:
- Capitalization hierarchy: PRIMARY GENRE IN ALL CAPS, Secondary Genre In Title Case, tertiary descriptors in lowercase
- Order: era/year → PRIMARY GENRE → sub-genres → BPM → key → chord flavour → vocal descriptor → instrument details → production quality → dynamics → mood/atmosphere
- Vocal descriptor must specify: gender (male/female), timbre (baritone/tenor/soprano/alto/raspy/breathy/soulful/angelic), delivery style (falsetto, vibrato, melismatic, Sprechgesang, lounge singer, sultry, resonant), AND a brief "actor-like" character note (e.g. "world-weary swagger", "intimate confessional", "soaring anthemic conviction")
- Include dynamics: e.g. "quiet introspective verses, explosive anthemic choruses, dynamic shifts" or "crescendo build into drop" — always state the CONTRAST between sections
- Include production quality + mastering descriptor: e.g. "radio-ready mix", "crisp and clean production with wide stereo image", "analog warmth", "reverb-drenched", "hyper-modern production", "punchy drums with controlled dynamic range"
- Include chord flavour if relevant: e.g. "I-IV-V-vi pop progression", "minor ii-V-I jazz changes", "Am-G-C-F loop"
- Describe instruments with articulation vocabulary: not just "guitar" but "palm-muted rhythm guitar", "staccato piano fills", "legato string swells", "pizzicato bass plucks", "marcato brass hits", "legato saxophone lead"
- Include performance nuance vocabulary: e.g. "slightly behind-the-beat drum feel", "breathy intimate vocal delivery", "aggressive pick attack on downbeats", "gentle imperceptible string swells", "subtle pitch bend on phrase endings"
- Target ~900 characters. Be dense and hyper-specific. Avoid vague words like "catchy" or "beautiful" — always specify HOW.
- Example: "1987, DANCE-POP, Hi-NRG, Stock Aitken Waterman production, 113 BPM, B minor, I-IV-V-vi chord structure, warm baritone male lead with soulful legato phrasing and light vibrato — intimate yet commanding delivery, bright gated-reverb snare on 2 and 4, punchy four-on-the-floor kick with sub tail, staccato syncopated slap bass, shimmering DX7 synth stabs panned wide, sawtooth lead synth, crisp and clean production with radio-ready master, quiet verses build to explosive chorus, analog warmth with slight tape saturation, wide stereo image"

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
- When in doubt, be MORE specific, not less`;


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
    lines.push(`USER PREFERENCE — Vocal gender: ${opts.vocalGender}. Use a ${opts.vocalGender} vocalist.`);
  }
  if (opts.energyLevel && opts.energyLevel !== "auto") {
    const energyMap: Record<string, string> = {
      chill: "chill, relaxed, low-energy — quiet dynamics, intimate delivery, sparse arrangement",
      medium: "medium energy — balanced dynamics, moderate intensity, clear arrangement",
      high: "high-energy, intense — loud dynamics, explosive choruses, dense arrangement, driving momentum",
    };
    lines.push(`USER PREFERENCE — Energy level: ${energyMap[opts.energyLevel] ?? opts.energyLevel}.`);
  }
  if (opts.tempo) {
    const tempoMap: Record<string, string> = {
      slow: "slow tempo, under 80 BPM — languid, spacious phrasing",
      mid: "mid tempo, 80–110 BPM — steady groove, comfortable pace",
      uptempo: "up-tempo, 110–130 BPM — driving energy, danceable",
      fast: "fast tempo, 130+ BPM — high-octane, frenetic, adrenaline",
    };
    lines.push(`USER PREFERENCE — Tempo: ${tempoMap[opts.tempo] ?? opts.tempo}. Include a BPM indicator in the style tags.`);
  }
  if (opts.era && opts.era !== "auto") {
    const eraMap: Record<string, string> = {
      "70s": "1970s — analog warmth, tape saturation, lush orchestration, vinyl grain",
      "80s": "1980s — gated reverb drums, synth-pop, DX7 keys, bright compressed production",
      "90s": "1990s — grunge, alt-rock, or golden-era hip-hop depending on genre; punchy transients",
      "2000s": "2000s — digital clarity, glossy pop production, early EDM influence",
      modern: "modern/contemporary — hyper-clean production, wide stereo, streaming-optimized loudness",
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
  return lines.length > 0 ? "\n\nUSER STYLE PREFERENCES (apply these to Section 1 and Section 2 header):\n" + lines.join("\n") : "";
}

router.post("/generate-template", async (req, res) => {
  try {
    const parsed = GenerateSunoTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body. Please provide a youtubeUrl." });
      return;
    }

    const { youtubeUrl, manualLyrics, vocalGender, energyLevel, era, genreNudge, genres, moods, instruments, mode, tempo, excludeTags, variationIndex } = parsed.data;

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

    const context = buildPromptContext(metadata);
    const styleControls = buildStyleControls({ vocalGender, energyLevel, era, genreNudge, genres, moods, instruments, tempo, excludeTags, variationIndex });

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

    const userMessage = `Create a Suno.ai template for this song. ${lyricsInstruction}${modeInstruction}${styleControls}

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
      lyrics: trimToCharLimit(aiResult.lyrics, 4999),
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

export default router;
