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
  captionText: string | null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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
  return {
    title: data.title,
    author: data.author_name,
    description: "",
    keywords: [],
    category: "",
    duration: "",
    captionText: null,
  };
}

async function fetchYouTubeMetadata(url: string): Promise<VideoMetadata> {
  try {
    const info = await ytdl.getInfo(url);
    const details = info.videoDetails;

    const durationSec = parseInt(details.lengthSeconds, 10);
    const captionText = await fetchCaptions(info);

    return {
      title: details.title,
      author: details.author.name,
      description: details.description ?? "",
      keywords: details.keywords ?? [],
      category: (details as unknown as { category?: string }).category ?? "",
      duration: formatDuration(durationSec),
      captionText,
    };
  } catch (ytdlErr) {
    console.warn("ytdl-core failed, falling back to oEmbed:", ytdlErr);
    return fetchViaOembed(url);
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

function buildPromptContext(metadata: VideoMetadata): string {
  const parts: string[] = [];

  parts.push(`Song: "${metadata.title}"`);
  parts.push(`Artist/Channel: ${metadata.author}`);
  if (metadata.duration) parts.push(`Duration: ${metadata.duration}`);
  if (metadata.category) parts.push(`YouTube Category: ${metadata.category}`);
  if (metadata.keywords.length > 0) {
    parts.push(`YouTube Tags: ${metadata.keywords.join(", ")}`);
  }
  if (metadata.description) {
    const desc = metadata.description.length > 2000
      ? metadata.description.slice(0, 2000) + "..."
      : metadata.description;
    parts.push(`Video Description:\n${desc}`);
  }
  if (metadata.captionText) {
    const captions = metadata.captionText.length > 4000
      ? metadata.captionText.slice(0, 4000) + "..."
      : metadata.captionText;
    parts.push(`Transcript/Lyrics from captions:\n${captions}`);
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
The Suno "Lyrics" field. This is NOT just lyrics — it is a full production metadata + song structure block. Rules:

HEADER BLOCK (production metadata, always first):
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

SONG STRUCTURE (after header):
Use these section markers with descriptions: [Intro - brief description], [Verse 1 - brief description], [Pre-Chorus - brief description], [Chorus - brief description], [Bridge - brief description], [Drop - brief description], [Breakdown - brief description], [Outro - brief description]

Bracket conventions:
- Square brackets [ ] = structural markers and production/instrument directions
- Parentheses ( ) = performance feel and emotional directions

Within each section, alternate between:
- [square bracket lines] describing specific instruments, sounds, and production elements
- (parenthetical lines) describing how it feels or the performance quality

If you have real lyrics from captions, USE THEM and structure them with the metatags. If not, write thematic placeholder lyrics that capture the song's mood.

Target 4900-4999 characters total for this field. Write enough sections and detail to hit this target.

=== SECTION 3: negativePrompt (90-199 chars) ===
What Suno should NOT generate. Rules:
- Comma-separated, NO spaces after commas
- List genres, instruments, styles, vocal types that clash with this song
- Target 90-199 characters exactly
- Example: "generic,lo-fi,acoustic guitar,country,jazz,spoken word,rap vocals,orchestral strings,piano ballad,choir,happy pop,folk,ukulele"

=== QUALITY RULES ===
- No asterisks (*) anywhere in output
- Pure English only
- No banned themes: no cyberpunk, neon, ghost-in-machine, tech metaphors
- No placeholder text or [INSERT X HERE] patterns
- Every detail should be specific and music-production accurate`;

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
    const hasCaptions = !!metadata.captionText;

    const userMessage = `Create a Suno.ai template for this song. ${hasCaptions ? "Real lyrics/transcript from captions are provided — use them as the basis for the lyrics section, structured with Suno metatags." : "No captions available — use your knowledge of this song and write thematic placeholder lyrics."}

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
      artist: metadata.author,
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
