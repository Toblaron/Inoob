import { openai } from "@workspace/integrations-openai-ai-server";
import ytdl from "@distube/ytdl-core";

export interface AudioFeatures {
  bpm: number;
  key: string;
  timeSignature: string;
  source: "description" | "getsongbpm" | "essentia" | "ai-knowledge";
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

/**
 * Tier 2.5: Server-side audio analysis via essentia.js WASM.
 * Downloads a short audio clip from YouTube, decodes to PCM,
 * and runs BPM + key detection on the actual audio signal.
 *
 * Timeout: 25 seconds total. Gracefully falls back to AI on any failure.
 */
async function analyzeWithEssentia(
  youtubeUrl: string,
  artist: string,
  title: string
): Promise<AudioFeatures | null> {
  // Only run if essentia is available and audio-decode is present
  try {
    // Dynamic imports to avoid startup cost when not needed
    const [essentiaModule, audioDecode] = await Promise.all([
      import("essentia.js").catch(() => null),
      import("audio-decode").catch(() => null),
    ]);

    if (!essentiaModule || !audioDecode) {
      console.warn("[essentia] packages not available, skipping");
      return null;
    }

    // Initialize essentia WASM
    let essentia: {
      RhythmExtractor2013: (signal: Float32Array) => { bpm: number; confidence: number };
      KeyExtractor: (signal: Float32Array) => { key: string; scale: string; strength: number };
      arrayToVector: (arr: Float32Array) => unknown;
    };

    try {
      const EssentiaLib = essentiaModule.default ?? essentiaModule;
      // Try to get WASM backend (Node.js variant)
      let EssentiaWASM;
      try {
        const wasmMod = await import("essentia.js/dist/essentia-wasm.node.js" as string);
        EssentiaWASM = await (wasmMod.default ?? wasmMod)();
      } catch {
        // Fallback: try module init without explicit WASM backend
        EssentiaWASM = await (EssentiaLib as unknown as { (): Promise<unknown> })();
      }
      essentia = new (EssentiaLib as unknown as new (wasm: unknown) => typeof essentia)(EssentiaWASM);
    } catch (initErr) {
      console.warn("[essentia] WASM init failed:", (initErr as Error).message?.slice(0, 60));
      return null;
    }

    console.log(`[essentia] starting audio download for "${artist} - ${title}"...`);

    // Download audio (worst quality = fastest, smallest file)
    // We only need ~30 seconds for a reliable BPM reading
    const downloadTimeout = AbortSignal.timeout(20000);
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const MAX_BYTES = 3 * 1024 * 1024; // 3 MB cap — enough for ~30s at low bitrate

    await new Promise<void>((resolve, reject) => {
      const stream = ytdl(youtubeUrl, {
        quality: "lowestaudio",
        filter: "audioonly",
        requestOptions: {
          headers: { "User-Agent": "Mozilla/5.0" },
        },
      });

      const abortTimer = setTimeout(() => {
        stream.destroy();
        reject(new Error("download timeout"));
      }, 20000);

      downloadTimeout.addEventListener("abort", () => {
        stream.destroy();
        reject(new Error("download aborted"));
      });

      stream.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        chunks.push(chunk);
        if (totalBytes >= MAX_BYTES) {
          stream.destroy();
          clearTimeout(abortTimer);
          resolve();
        }
      });
      stream.on("end", () => { clearTimeout(abortTimer); resolve(); });
      stream.on("error", (err: Error) => { clearTimeout(abortTimer); reject(err); });
    });

    if (chunks.length === 0) return null;

    const audioBuffer = Buffer.concat(chunks);
    console.log(`[essentia] downloaded ${(audioBuffer.length / 1024).toFixed(0)} KB`);

    // Decode audio to PCM
    const decoded = await audioDecode.default(audioBuffer).catch((e: Error) => {
      console.warn("[essentia] decode error:", e.message?.slice(0, 60));
      return null;
    });

    if (!decoded) return null;

    // Flatten to mono Float32Array (average channels)
    const numChannels = decoded.numberOfChannels;
    const length = decoded.length;
    const mono = new Float32Array(length);

    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = decoded.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mono[i] += channelData[i] / numChannels;
      }
    }

    const sampleRate = decoded.sampleRate;
    console.log(`[essentia] decoded ${length} samples @ ${sampleRate}Hz (${(length / sampleRate).toFixed(1)}s)`);

    // Convert to essentia vector
    const signal = essentia.arrayToVector(mono);

    // BPM analysis
    let bpm = 0;
    let bpmConfidence = 0;
    try {
      const rhythmResult = essentia.RhythmExtractor2013(signal as Float32Array);
      bpm = Math.round(rhythmResult.bpm);
      bpmConfidence = rhythmResult.confidence;
      console.log(`[essentia] BPM: ${bpm} (confidence: ${bpmConfidence.toFixed(2)})`);
    } catch (e) {
      console.warn("[essentia] BPM extraction failed:", (e as Error).message?.slice(0, 60));
    }

    // Key analysis
    let keyStr = "";
    let keyStrength = 0;
    try {
      const keyResult = essentia.KeyExtractor(signal as Float32Array);
      keyStr = `${keyResult.key} ${keyResult.scale}`;
      keyStrength = keyResult.strength;
      console.log(`[essentia] Key: ${keyStr} (strength: ${keyStrength.toFixed(2)})`);
    } catch (e) {
      console.warn("[essentia] key extraction failed:", (e as Error).message?.slice(0, 60));
    }

    if (!bpm || bpm < 40 || bpm > 300) return null;

    // Combined confidence: average of BPM and key confidence
    const confidence = keyStrength
      ? (bpmConfidence + keyStrength) / 2
      : bpmConfidence;

    return {
      bpm,
      key: normalizeKey(keyStr) || keyStr,
      timeSignature: "4/4", // Essentia's RhythmExtractor doesn't provide time sig
      source: "essentia",
      confidence: Math.min(0.96, confidence),
    };

  } catch (err) {
    console.warn("[essentia] analysis failed:", (err as Error).message?.slice(0, 80));
    return null;
  }
}

async function fetchAiKnowledge(
  artist: string,
  title: string
): Promise<AudioFeatures | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
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
  const { artist, title, youtubeUrl, descriptionBpm, descriptionKey, skipEssentia } = opts;

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

  // Tier 2.5: Server-side audio analysis via essentia.js
  // Only runs when ENABLE_ESSENTIA=true env var is set (opt-in due to download overhead)
  if (!skipEssentia && process.env.ENABLE_ESSENTIA === "true" && youtubeUrl) {
    const essentiaResult = await analyzeWithEssentia(youtubeUrl, artist, title);
    if (essentiaResult && essentiaResult.bpm > 0) {
      console.log(`[audioFeatures] Essentia → ${essentiaResult.bpm} BPM, ${essentiaResult.key}`);
      return essentiaResult;
    }
  }

  // Tier 3: AI knowledge-based estimation (fast, no audio download, no external API key)
  const aiResult = await fetchAiKnowledge(artist, title);
  if (aiResult) return aiResult;

  return null;
}
