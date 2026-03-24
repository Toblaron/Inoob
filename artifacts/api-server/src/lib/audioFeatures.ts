import { openai } from "@workspace/integrations-openai-ai-server";

export interface AudioFeatures {
  bpm: number;
  key: string;
  timeSignature: string;
  source: "description" | "getsongbpm" | "ai-knowledge";
  confidence: number;
}

const KEY_ABBREV_MAP: Record<string, string> = {
  C: "C major", Cm: "C minor", "C#": "C# major", "C#m": "C# minor",
  Db: "Db major", Dbm: "Db minor", D: "D major", Dm: "D minor",
  "D#": "D# major", "D#m": "D# minor", Eb: "Eb major", Ebm: "Eb minor",
  E: "E major", Em: "E minor", F: "F major", Fm: "F minor",
  "F#": "F# major", "F#m": "F# minor", Gb: "Gb major", Gbm: "Gb minor",
  G: "G major", Gm: "G minor", "G#": "G# major", "G#m": "G# minor",
  Ab: "Ab major", Abm: "Ab minor", A: "A major", Am: "A minor",
  "A#": "A# major", "A#m": "A# minor", Bb: "Bb major", Bbm: "Bb minor",
  B: "B major", Bm: "B minor",
};

function normalizeKey(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (KEY_ABBREV_MAP[trimmed]) return KEY_ABBREV_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  if (lower.includes("major") || lower.includes("minor")) return trimmed;
  return trimmed;
}

async function fetchGetSongBPM(
  artist: string,
  title: string
): Promise<AudioFeatures | null> {
  const apiKey = process.env.GETSONGBPM_API_KEY;
  if (!apiKey) return null;

  try {
    const lookup = encodeURIComponent(`song:${title} artist:${artist}`);
    const searchUrl = `https://api.getsong.co/search/?api_key=${apiKey}&type=both&lookup=${lookup}&limit=5`;

    const searchResp = await fetch(searchUrl, {
      signal: AbortSignal.timeout(6000),
    });
    if (!searchResp.ok) return null;

    const searchData = (await searchResp.json()) as {
      search?: Array<{ id: string; title: string; tempo: string; key_of: string; time_sig: string }>;
    };

    const results = searchData.search;
    if (!results || results.length === 0) return null;

    const match = results[0];
    let bpm = parseFloat(match.tempo);
    let key = normalizeKey(match.key_of ?? "");
    let timeSig = match.time_sig || "4/4";

    if (isNaN(bpm) || bpm < 40) {
      const songUrl = `https://api.getsong.co/song/?api_key=${apiKey}&id=${match.id}`;
      const songResp = await fetch(songUrl, { signal: AbortSignal.timeout(5000) });
      if (!songResp.ok) return null;
      const songData = (await songResp.json()) as {
        song?: { tempo: string; key_of: string; time_sig: string };
      };
      const s = songData.song;
      if (!s) return null;
      bpm = parseFloat(s.tempo);
      key = normalizeKey(s.key_of ?? "");
      timeSig = s.time_sig || "4/4";
    }

    if (isNaN(bpm) || bpm < 40 || bpm > 300) return null;

    return {
      bpm: Math.round(bpm),
      key,
      timeSignature: timeSig,
      source: "getsongbpm",
      confidence: 0.92,
    };
  } catch (err) {
    console.warn("[audioFeatures] GetSongBPM error:", (err as Error).message?.slice(0, 80));
    return null;
  }
}

async function fetchAiKnowledge(
  artist: string,
  title: string
): Promise<AudioFeatures | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 120,
      messages: [
        {
          role: "system",
          content: `You are a music theory database. Given a song title and artist, return ONLY a JSON object with the following fields: bpm (integer), key (e.g. "A minor", "C major", "F# minor"), time_signature (e.g. "4/4"), confidence ("high" | "medium" | "low"). If you are not confident about BPM or key, set confidence to "low" and use your best estimate. Never refuse — always attempt an answer. Respond with raw JSON only, no markdown.`,
        },
        {
          role: "user",
          content: `Song: "${title}" by ${artist}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const cleaned = raw.replace(/^```(?:json)?|```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      bpm?: number;
      key?: string;
      time_signature?: string;
      confidence?: string;
    };

    const bpm = Math.round(Number(parsed.bpm));
    const key = normalizeKey(parsed.key ?? "");
    const timeSig = parsed.time_signature || "4/4";
    const confidence = parsed.confidence === "high" ? 0.88
      : parsed.confidence === "medium" ? 0.70
      : 0.50;

    if (isNaN(bpm) || bpm < 40 || bpm > 300) return null;

    console.log(`[audioFeatures] AI knowledge → ${bpm} BPM, ${key}, ${timeSig} (confidence: ${parsed.confidence})`);

    return {
      bpm,
      key,
      timeSignature: timeSig,
      source: "ai-knowledge",
      confidence,
    };
  } catch (err) {
    console.warn("[audioFeatures] AI knowledge lookup failed:", (err as Error).message?.slice(0, 80));
    return null;
  }
}

export async function detectAudioFeatures(opts: {
  artist: string;
  title: string;
  youtubeUrl: string;
  descriptionBpm?: string;
  descriptionKey?: string;
  skipEssentia?: boolean;
}): Promise<AudioFeatures | null> {
  const { artist, title, descriptionBpm, descriptionKey } = opts;

  // Tier 1: description/title parsing (instant, no API)
  if (descriptionBpm) {
    const bpmNum = parseFloat(descriptionBpm);
    if (!isNaN(bpmNum) && bpmNum >= 40 && bpmNum <= 300) {
      console.log(`[audioFeatures] BPM from description: ${Math.round(bpmNum)}`);
      return {
        bpm: Math.round(bpmNum),
        key: normalizeKey(descriptionKey ?? ""),
        timeSignature: "4/4",
        source: "description",
        confidence: 0.95,
      };
    }
  }

  // Tier 2: GetSongBPM API (only runs if GETSONGBPM_API_KEY is set)
  const gsbResult = await fetchGetSongBPM(artist, title);
  if (gsbResult) {
    console.log(`[audioFeatures] GetSongBPM → ${gsbResult.bpm} BPM, ${gsbResult.key}`);
    return gsbResult;
  }

  // Tier 3: AI knowledge-based estimation (fast, no audio download, no external API key)
  const aiResult = await fetchAiKnowledge(artist, title);
  if (aiResult) return aiResult;

  return null;
}
