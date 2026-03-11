import { Router, type IRouter } from "express";
import { GenerateSunoTemplateBody, GenerateSunoTemplateResponse } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

async function fetchYouTubeMetadata(url: string): Promise<{ title: string; author: string }> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetch(oembedUrl);
  if (!response.ok) {
    throw new Error("Could not fetch video metadata. Make sure the URL is a valid, public YouTube video.");
  }
  const data = await response.json() as { title: string; author_name: string };
  return { title: data.title, author: data.author_name };
}

function isValidYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "www.youtube.com" || parsed.hostname === "youtube.com" || parsed.hostname === "youtu.be" || parsed.hostname === "m.youtube.com") &&
      (parsed.pathname.includes("/watch") || parsed.hostname === "youtu.be" || parsed.pathname.includes("/shorts/"))
    );
  } catch {
    return false;
  }
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

    const metadata = await fetchYouTubeMetadata(youtubeUrl);

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content: `You are a music analysis expert that creates Suno.ai prompt templates. Given a song title and artist, generate a complete Suno.ai template.

You must respond with valid JSON matching this exact structure:
{
  "styleOfMusic": "comma-separated genre and style tags suitable for Suno's 'Style of Music' field (e.g. 'indie rock, dreamy, reverb-heavy guitars, male vocals, anthemic')",
  "title": "a suggested title for the Suno creation",
  "lyrics": "structured lyrics with Suno metatags like [Intro], [Verse 1], [Chorus], [Verse 2], [Bridge], [Outro] etc. Include placeholder lyric lines that capture the mood and theme of the original song. Use line breaks between sections.",
  "tags": ["array", "of", "additional", "tags", "for", "mood", "instruments", "tempo"]
}

Guidelines for the template:
- styleOfMusic should be detailed and specific, including genre, subgenre, mood, vocal style, key instruments, and production style
- lyrics should use Suno's metatag format with realistic placeholder lyrics inspired by the original song's themes (NOT the actual copyrighted lyrics)
- Include tempo hints (e.g. "120 BPM") in the tags
- Include key signature hints if known
- tags should cover mood, instruments, production techniques, and era/influence
- Make the template immediately usable in Suno.ai without modification`
        },
        {
          role: "user",
          content: `Create a Suno.ai template for: "${metadata.title}" by ${metadata.author}`
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
