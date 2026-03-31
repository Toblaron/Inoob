export interface SuggestedDefaults {
  energy?: string;
  tempo?: string;
  era?: string;
  instrumentHints?: string[];
  languageGenreHint?: string;
  sources: Record<string, string>;
}

const INSTRUMENT_PATTERNS: [RegExp, string][] = [
  [/\bacoustic guitar\b/i, "Acoustic Guitar"],
  [/\belectric guitar\b/i, "Electric Guitar"],
  [/\b(lead |rhythm )?guitar\b/i, "Guitar"],
  [/\bpiano\b/i, "Piano"],
  [/\bkeyboard\b/i, "Keyboards"],
  [/\bsynth(esizer)?\b/i, "Synth"],
  [/\bviolin\b/i, "Violin"],
  [/\bcello\b/i, "Cello"],
  [/\borchestra\b|\bstrings\b/i, "Strings"],
  [/\bdrums?\b/i, "Drums"],
  [/\bbass guitar\b/i, "Bass Guitar"],
  [/\bbass\b/i, "Bass"],
  [/\bflute\b/i, "Flute"],
  [/\bsaxophone\b|\bsax\b/i, "Saxophone"],
  [/\btrumpet\b/i, "Trumpet"],
  [/\bbanjo\b/i, "Banjo"],
  [/\bukulele\b/i, "Ukulele"],
  [/\bharmonica\b/i, "Harmonica"],
  [/\bcelesta\b/i, "Celesta"],
  [/\bxylophone\b|\bmarimba\b/i, "Marimba"],
  [/\b808\b/i, "808 Bass"],
  [/\bturntable\b|\bscratching\b/i, "Turntables"],
];

const LANGUAGE_GENRE_HINTS: Record<string, string> = {
  Korean: "K-Pop",
  Japanese: "J-Pop",
  Spanish: "Latin Pop",
  Portuguese: "Latin Pop",
  French: "French Pop",
  German: "Eurodance",
  Italian: "Italian Pop",
  Mandarin: "Mandopop",
  Cantonese: "Cantopop",
  Hindi: "Bollywood",
  Thai: "Thai Pop",
  Indonesian: "Indonesian Pop",
};

export function computeSuggestedDefaults(params: {
  bpm?: number;
  releaseYear?: string;
  description?: string;
  language?: string;
}): SuggestedDefaults {
  const result: SuggestedDefaults = { sources: {} };

  if (params.bpm) {
    const bpm = params.bpm;

    if (bpm >= 140) {
      result.energy = "intense";
    } else if (bpm >= 120) {
      result.energy = "high";
    } else if (bpm >= 90) {
      result.energy = "medium";
    } else if (bpm >= 60) {
      result.energy = "chill";
    } else {
      result.energy = "very chill";
    }
    result.sources.energy = `BPM ${bpm}`;

    if (bpm >= 145) {
      result.tempo = "hyper";
    } else if (bpm >= 130) {
      result.tempo = "fast";
    } else if (bpm >= 115) {
      result.tempo = "uptempo";
    } else if (bpm >= 100) {
      result.tempo = "groove";
    } else if (bpm >= 80) {
      result.tempo = "mid";
    } else if (bpm >= 60) {
      result.tempo = "slow";
    } else {
      result.tempo = "ballad";
    }
    result.sources.tempo = `BPM ${bpm}`;
  }

  if (params.releaseYear) {
    const y = parseInt(params.releaseYear, 10);
    if (!isNaN(y)) {
      if (y < 1960) result.era = "50s";
      else if (y < 1970) result.era = "60s";
      else if (y < 1980) result.era = "70s";
      else if (y < 1990) result.era = "80s";
      else if (y < 2000) result.era = "90s";
      else if (y < 2010) result.era = "2000s";
      else if (y < 2020) result.era = "2010s";
      else result.era = "modern";
      result.sources.era = `Release year ${y}`;
    }
  }

  if (params.language && params.language !== "English") {
    const hint = LANGUAGE_GENRE_HINTS[params.language];
    if (hint) {
      result.languageGenreHint = hint;
      result.sources.languageGenreHint = `Language: ${params.language}`;
    }
  }

  if (params.description) {
    const instruments: string[] = [];
    for (const [pattern, name] of INSTRUMENT_PATTERNS) {
      if (pattern.test(params.description) && !instruments.includes(name)) {
        instruments.push(name);
      }
    }
    if (instruments.length > 0) {
      result.instrumentHints = instruments.slice(0, 5);
      result.sources.instrumentHints = "Video description";
    }
  }

  return result;
}
