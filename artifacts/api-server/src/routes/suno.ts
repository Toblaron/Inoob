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
      category: (details as Record<string, unknown> & { category?: string }).category ?? "",
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
  parts.push(`Duration: ${metadata.duration}`);

  if (metadata.category) {
    parts.push(`YouTube Category: ${metadata.category}`);
  }

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

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content: `You are a music analysis expert that creates Suno.ai prompt templates. You will be given detailed information about a song from YouTube, including metadata, tags, description, and${hasCaptions ? " the actual lyrics/transcript from captions" : " possibly no lyrics (use your knowledge of the song if you know it)"}.

Your job is to create the most accurate possible Suno.ai template that would recreate a song with the same feel, structure, genre, and energy.

You must respond with valid JSON matching this exact structure:
{
  "styleOfMusic": "comma-separated genre and style tags suitable for Suno's 'Style of Music' field",
  "title": "a suggested title for the Suno creation",
  "lyrics": "structured lyrics with Suno metatags",
  "tags": ["array", "of", "tags"]
}

Guidelines:
- **styleOfMusic**: Be very specific and detailed. Include: primary genre, subgenre, mood, vocal style (male/female/falsetto/raspy/etc), key instruments, production style, era/decade influence. Example: "80s synth-pop, upbeat, male vocals, punchy drums, analog synths, reverb-heavy, danceable, 118 BPM"
- **lyrics**: Use Suno metatags: [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Outro], [Instrumental], [Guitar Solo], etc.${hasCaptions ? " You have the actual lyrics — use them as the basis, adapting them into proper Suno metatag structure. Preserve the real lyric content." : " Write original placeholder lyrics that capture the mood, themes, and vocal patterns of the original song. Do NOT reproduce copyrighted lyrics."}
- **tags**: Include BPM estimate, key signature if known, mood descriptors, era, instruments, production techniques, vocal characteristics. Aim for 8-15 tags.
- **title**: A creative title inspired by the original song.
- Use the video description and YouTube tags to inform genre, mood, and style accuracy.
- Match the song duration: ${metadata.duration} — structure the lyrics to fit this length realistically.`
        },
        {
          role: "user",
          content: `Create a Suno.ai template for this song:\n\n${context}`
        }
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
      tags: string[];
    };

    const template = GenerateSunoTemplateResponse.parse({
      songTitle: metadata.title,
      artist: metadata.author,
      styleOfMusic: aiResult.styleOfMusic,
      title: aiResult.title,
      lyrics: aiResult.lyrics,
      tags: aiResult.tags,
    });

    res.json(template);
  } catch (err: unknown) {
    console.error("Error generating template:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    res.status(500).json({ error: message });
  }
});

export default router;
