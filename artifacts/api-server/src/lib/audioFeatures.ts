import { createRequire } from "module";
import ytdl from "@distube/ytdl-core";

const _require = createRequire(import.meta.url);

export interface AudioFeatures {
  bpm: number;
  key: string;
  timeSignature: string;
  source: "description" | "getsongbpm" | "essentia";
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
    console.warn(
      "[audioFeatures] GetSongBPM error:",
      (err as Error).message?.slice(0, 80)
    );
    return null;
  }
}

async function analyzeWithEssentia(
  youtubeUrl: string
): Promise<AudioFeatures | null> {
  const MAX_BYTES = 4 * 1024 * 1024;
  const STREAM_TIMEOUT_MS = 35_000;

  try {
    const { EssentiaWASM, Essentia } = _require("essentia.js") as {
      EssentiaWASM: object;
      Essentia: new (wasm: object) => {
        arrayToVector: (arr: Float32Array) => object;
        RhythmExtractor2013: (vec: object) => { bpm: number };
        KeyExtractor: (vec: object) => { key: string; scale: string; strength: number };
        delete: () => void;
        version: string;
      };
    };
    const audioDecode = ((await import("audio-decode")) as { default: (buf: Buffer) => Promise<{ channelData: Float32Array[]; sampleRate: number }> }).default;

    const audioStream = ytdl(youtubeUrl, {
      filter: "audioonly",
      quality: "lowestaudio",
    });

    const chunks: Buffer[] = [];
    let totalBytes = 0;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        audioStream.destroy();
        resolve();
      }, STREAM_TIMEOUT_MS);

      audioStream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        totalBytes += chunk.length;
        if (totalBytes >= MAX_BYTES) {
          clearTimeout(timeout);
          audioStream.destroy();
          resolve();
        }
      });
      audioStream.on("end", () => { clearTimeout(timeout); resolve(); });
      audioStream.on("error", (err) => { clearTimeout(timeout); reject(err); });
    });

    if (chunks.length === 0) return null;

    const audioBuffer = Buffer.concat(chunks);
    const decoded = await audioDecode(audioBuffer);

    if (!decoded.channelData || decoded.channelData.length === 0) return null;

    const sampleRate = decoded.sampleRate || 44100;
    const channelData = decoded.channelData[0];
    const maxSamples = Math.min(channelData.length, sampleRate * 90);
    const audioSlice = channelData.slice(0, maxSamples);

    const essentia = new Essentia(EssentiaWASM);
    const audioVector = essentia.arrayToVector(audioSlice);

    const rhythmResult = essentia.RhythmExtractor2013(audioVector);
    const keyResult = essentia.KeyExtractor(audioVector);
    essentia.delete();

    const bpm = Math.round(rhythmResult.bpm);
    const key = `${keyResult.key} ${keyResult.scale}`;
    const confidence = keyResult.strength;

    if (bpm < 40 || bpm > 300) return null;

    return {
      bpm,
      key,
      timeSignature: "4/4",
      source: "essentia",
      confidence,
    };
  } catch (err) {
    console.warn(
      "[audioFeatures] Essentia analysis failed:",
      (err as Error).message?.slice(0, 120)
    );
    return null;
  }
}

export async function detectAudioFeatures(opts: {
  artist: string;
  title: string;
  youtubeUrl: string;
  descriptionBpm?: string;
  descriptionKey?: string;
  /** Skip the slow Essentia audio analysis tier (default false). Use true for parallel fast lookups. */
  skipEssentia?: boolean;
}): Promise<AudioFeatures | null> {
  const { artist, title, youtubeUrl, descriptionBpm, descriptionKey, skipEssentia } = opts;

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

  const gsbResult = await fetchGetSongBPM(artist, title);
  if (gsbResult) {
    console.log(
      `[audioFeatures] GetSongBPM → ${gsbResult.bpm} BPM, ${gsbResult.key}, ${gsbResult.timeSignature}`
    );
    return gsbResult;
  }

  if (skipEssentia) return null;

  console.log("[audioFeatures] No DB match — running Essentia.js audio analysis...");
  const essentiaResult = await analyzeWithEssentia(youtubeUrl);
  if (essentiaResult) {
    console.log(
      `[audioFeatures] Essentia → ${essentiaResult.bpm} BPM, ${essentiaResult.key} (confidence: ${essentiaResult.confidence.toFixed(2)})`
    );
    return essentiaResult;
  }

  return null;
}
