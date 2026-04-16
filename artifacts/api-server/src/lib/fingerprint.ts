import type { AudioFeatures } from "./audioFeatures.js";

export interface SongFingerprint {
  energy: number;
  tempoFeel: number;
  vocalPresence: number;
  instrumentalComplexity: number;
  eraAuthenticity: number;
  moodValence: number;
  genrePurity: number;
  videoId?: string;
  songTitle?: string;
  artist?: string;
  computedAt?: number;
}

function clamp(v: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Compute a Song DNA Fingerprint from available metadata.
 * All axes are normalized to 0–10 scores.
 */
export function computeFingerprint(opts: {
  audioFeatures?: AudioFeatures;
  isInstrumental?: boolean;
  vocalGender?: string;
  energyLevel?: string;
  era?: string;
  tempo?: string;
  styleOfMusic?: string;
  tags?: string[];
  musicBrainzGenres?: string[];
  keywords?: string[];
  title?: string;
  videoId?: string;
  songTitle?: string;
  artist?: string;
}): SongFingerprint {
  const {
    audioFeatures,
    isInstrumental = false,
    vocalGender = "auto",
    energyLevel = "auto",
    era = "auto",
    tempo,
    styleOfMusic = "",
    tags = [],
    musicBrainzGenres = [],
    keywords = [],
    videoId,
    songTitle,
    artist,
  } = opts;

  const styleLower = styleOfMusic.toLowerCase();
  const tagsLower = tags.map((t) => t.toLowerCase()).join(" ");
  const genresLower = musicBrainzGenres.map((g) => g.toLowerCase()).join(" ");
  const keywordsLower = keywords.map((k) => k.toLowerCase()).join(" ");
  const allText = `${styleLower} ${tagsLower} ${genresLower} ${keywordsLower}`;

  // ─── Energy (0–10) ───────────────────────────────────────────────────────
  let energy = 5.0;
  if (audioFeatures?.bpm) {
    const bpm = audioFeatures.bpm;
    if (bpm < 60) energy = 1.5;
    else if (bpm < 75) energy = 3.0;
    else if (bpm < 95) energy = 4.5;
    else if (bpm < 115) energy = 6.0;
    else if (bpm < 130) energy = 7.0;
    else if (bpm < 145) energy = 8.0;
    else if (bpm < 170) energy = 9.0;
    else energy = 10.0;
  }
  const energyLevelMap: Record<string, number> = {
    "very chill": -2.5, chill: -1.5, medium: 0, high: 1.5, intense: 2.5,
  };
  energy += energyLevelMap[energyLevel] ?? 0;

  if (/ambient|drone|meditation|sleep/.test(allText)) energy -= 1.5;
  if (/hardcore|gabber|speedcore|industrial/.test(allText)) energy += 2;
  if (/ballad|slow|lullaby/.test(allText)) energy -= 1;
  if (/festival|edm|big room/.test(allText)) energy += 1.5;
  energy = clamp(energy);

  // ─── Tempo Feel (0–10) ────────────────────────────────────────────────────
  let tempoFeel = 5.0;
  if (audioFeatures?.bpm) {
    const bpm = audioFeatures.bpm;
    tempoFeel = Math.min(10, Math.max(0, (bpm - 50) / 15));
  } else {
    const tempoMap: Record<string, number> = {
      ballad: 1.0, slow: 2.5, mid: 4.5, groove: 5.5, uptempo: 7.0, fast: 8.5, hyper: 10.0,
    };
    tempoFeel = tempoMap[tempo ?? ""] ?? 5.0;
  }
  tempoFeel = clamp(tempoFeel);

  // ─── Vocal Presence (0–10) ────────────────────────────────────────────────
  let vocalPresence = 6.0;
  if (isInstrumental || vocalGender === "no vocals") {
    vocalPresence = 0;
  } else {
    const vocalMap: Record<string, number> = {
      male: 7.0, female: 7.5, mixed: 8.0, duet: 8.5, auto: 6.0,
    };
    vocalPresence = vocalMap[vocalGender] ?? 6.0;
    if (/choir|chorus|harmonies|call.and.response/.test(allText)) vocalPresence += 1;
    if (/instrumental|no vocals|no singing/.test(allText)) vocalPresence = 0;
    if (/whispered|breathy|intimate vocal/.test(allText)) vocalPresence -= 1;
  }
  vocalPresence = clamp(vocalPresence);

  // ─── Instrumental Complexity (0–10) ──────────────────────────────────────
  let instrumentalComplexity = 5.0;
  const complexInstruments = ["strings", "brass", "orchestr", "choir", "harp", "cello", "violin", "trumpet", "saxophone", "oboe", "flute", "bassoon", "french horn", "piano", "harpsichord"];
  const simpleInstruments = ["drums", "bass", "808", "kick", "hi-hat", "snare", "clap"];
  const complexMatches = complexInstruments.filter((i) => allText.includes(i)).length;
  const simpleMatches = simpleInstruments.filter((i) => allText.includes(i)).length;
  instrumentalComplexity += complexMatches * 0.7 - simpleMatches * 0.2;
  if (/prog|jazz fusion|big band|classical|orchestral|cinematic score|film score/.test(allText)) instrumentalComplexity += 2;
  if (/minimal|lo-fi|drone|ambient/.test(allText)) instrumentalComplexity -= 1.5;
  if (/trap|boom bap|hip.hop|drill/.test(allText)) instrumentalComplexity -= 0.5;
  instrumentalComplexity = clamp(instrumentalComplexity);

  // ─── Era Authenticity (0–10) ─────────────────────────────────────────────
  let eraAuthenticity = 4.0;
  const eraKeywords: Record<string, string[]> = {
    "50s": ["rockabilly", "doo-wop", "1950", "mono recording", "slap-back"],
    "60s": ["motown", "beatles", "psychedelic", "garage rock", "1960"],
    "70s": ["disco", "funk", "prog rock", "analog", "tape saturation", "1970"],
    "80s": ["synth-pop", "new wave", "gated reverb", "dx7", "1980", "eighties"],
    "90s": ["grunge", "alt-rock", "britpop", "golden age hip-hop", "flannel", "1990"],
    "2000s": ["post-grunge", "crunk", "2000", "digital clarity", "noughties"],
    "2010s": ["edm", "trap", "festival", "side-chain", "2010"],
    modern: ["contemporary", "2020", "streaming", "hyperpop", "phonk"],
  };
  const detectedEra = era !== "auto" ? era : null;
  if (detectedEra && eraKeywords[detectedEra]) {
    const matches = eraKeywords[detectedEra].filter((kw) => allText.includes(kw)).length;
    eraAuthenticity = 4 + matches * 1.5;
    if (era !== "auto") eraAuthenticity += 2;
  } else {
    let totalEraMatches = 0;
    for (const kws of Object.values(eraKeywords)) {
      totalEraMatches += kws.filter((kw) => allText.includes(kw)).length;
    }
    eraAuthenticity = Math.min(10, 3 + totalEraMatches);
  }
  eraAuthenticity = clamp(eraAuthenticity);

  // ─── Mood Valence (0–10, 0=dark/sad, 10=bright/happy) ───────────────────
  let moodValence = 5.0;
  const positiveWords = ["happy", "euphoric", "playful", "festive", "uplifting", "blissful", "triumphant", "hopeful", "joyful", "bright", "sunny", "fun", "groovy", "feel.good"];
  const negativeWords = ["dark", "melancholic", "brooding", "sad", "haunting", "desolate", "angry", "eerie", "gloomy", "tragic", "mournful", "grief", "pain", "despair", "ominous", "sinister"];
  const positiveScore = positiveWords.filter((w) => allText.includes(w)).length;
  const negativeScore = negativeWords.filter((w) => allText.includes(w)).length;
  moodValence += positiveScore * 0.8 - negativeScore * 0.8;
  if (audioFeatures?.key) {
    const keyLower = audioFeatures.key.toLowerCase();
    if (keyLower.includes("major")) moodValence += 1;
    if (keyLower.includes("minor")) moodValence -= 1;
  }
  if (/wistful|bittersweet|nostalgic/.test(allText)) moodValence -= 0.5;
  moodValence = clamp(moodValence);

  // ─── Genre Purity (0–10) ─────────────────────────────────────────────────
  let genrePurity = 5.0;
  const genreCount = musicBrainzGenres.length;
  if (genreCount === 0) {
    genrePurity = 5.0;
  } else if (genreCount === 1) {
    genrePurity = 8.0;
  } else if (genreCount === 2) {
    genrePurity = 6.5;
  } else if (genreCount <= 4) {
    genrePurity = 5.0;
  } else {
    genrePurity = 3.0;
  }
  if (/fusion|crossover|hybrid|experimental/.test(allText)) genrePurity -= 2;
  if (/classic|traditional|pure|roots/.test(allText)) genrePurity += 1;
  genrePurity = clamp(genrePurity);

  return {
    energy: round1(energy),
    tempoFeel: round1(tempoFeel),
    vocalPresence: round1(vocalPresence),
    instrumentalComplexity: round1(instrumentalComplexity),
    eraAuthenticity: round1(eraAuthenticity),
    moodValence: round1(moodValence),
    genrePurity: round1(genrePurity),
    videoId,
    songTitle,
    artist,
    computedAt: Date.now(),
  };
}
