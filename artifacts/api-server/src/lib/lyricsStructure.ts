export interface LyricsSection {
  label: string;
  lines: string[];
  rhymeScheme: string;
  sentiment: number;
  isHook: boolean;
  repetitionKey: string;
}

export interface LyricsStructure {
  sections: LyricsSection[];
  hookRepetitions: number;
  sentimentArc: number[];
  hasTaggedStructure: boolean;
  totalSections: number;
  dominantScheme: string;
}

const POSITIVE_WORDS = new Set([
  "love", "happy", "joy", "beautiful", "light", "dream", "smile", "free", "hope",
  "bright", "life", "peace", "heart", "wonderful", "amazing", "heaven", "angel",
  "sweet", "sunshine", "forever", "together", "baby", "glow", "glory", "shine",
  "rise", "win", "fly", "dance", "sing", "good", "gold", "magic", "warm", "alive",
  "laugh", "bliss", "faith", "grace", "thank", "kind", "pure", "soft", "gentle",
]);

const NEGATIVE_WORDS = new Set([
  "sad", "pain", "cry", "broken", "lost", "dark", "fear", "die", "hate", "alone",
  "hurt", "fall", "fail", "regret", "tear", "tears", "sorrow", "empty", "cold",
  "gone", "never", "dead", "bleed", "burn", "hell", "suffer", "shame", "blame",
  "guilty", "wrong", "bad", "evil", "war", "wound", "grief", "despair", "numb",
  "void", "bitter", "rage", "cruel", "break", "shatter", "trapped", "drown",
]);

function getRhymeKey(line: string): string {
  const clean = line
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s']/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const last = clean[clean.length - 1] ?? "";
  return last.length >= 3 ? last.slice(-3) : last;
}

function detectRhymeScheme(lines: string[]): string {
  const meaningful = lines.filter((l) => l.trim().length > 2);
  if (meaningful.length < 2) return "-";
  const sample = meaningful.slice(0, 8);
  const keys = sample.map(getRhymeKey);
  const rhymeMap = new Map<string, string>();
  let nextIdx = 0;
  const LABELS = "ABCDEFGH";
  const scheme = keys.map((k) => {
    if (!k || k.length < 2) return "X";
    if (!rhymeMap.has(k)) {
      rhymeMap.set(k, LABELS[nextIdx++] ?? "X");
    }
    return rhymeMap.get(k)!;
  });
  return scheme.join("");
}

function scoreSentiment(lines: string[]): number {
  const text = lines
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ");
  const words = text.split(/\s+/).filter((w) => w.length > 2);
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) pos++;
    if (NEGATIVE_WORDS.has(w)) neg++;
  }
  const total = pos + neg;
  if (total === 0) return 0;
  return parseFloat(((pos - neg) / total).toFixed(2));
}

function normalizeSectionLabel(raw: string): string {
  const clean = raw
    .replace(/^\[|\]$/g, "")
    .split(/[-–,]/)[0]
    .trim();
  const lower = clean.toLowerCase();
  if (/chorus|hook|refrain/.test(lower)) return "Chorus";
  if (/verse/.test(lower)) {
    const num = clean.match(/\d+/)?.[0];
    return num ? `Verse ${num}` : "Verse";
  }
  if (/pre.?chorus|build.?up/.test(lower)) return "Pre-Chorus";
  if (/bridge/.test(lower)) return "Bridge";
  if (/intro/.test(lower)) return "Intro";
  if (/outro/.test(lower)) return "Outro";
  if (/break/.test(lower)) return "Break";
  if (/interlude/.test(lower)) return "Interlude";
  if (/drop/.test(lower)) return "Drop";
  if (/solo/.test(lower)) return "Solo";
  if (/spoken|narration/.test(lower)) return "Spoken Word";
  return clean || "Section";
}

function isHookLabel(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes("chorus") || l.includes("hook") || l.includes("refrain");
}

function buildRepetitionKey(lines: string[]): string {
  return lines
    .filter((l) => l.trim().length > 0)
    .slice(0, 3)
    .join("|")
    .toLowerCase()
    .replace(/[^a-z|]/g, "");
}

function dominantScheme(sections: LyricsSection[]): string {
  const counts = new Map<string, number>();
  for (const s of sections) {
    const k = s.rhymeScheme;
    if (k && k !== "-") counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size === 0) return "-";
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? "-";
}

export function analyzeLyricsStructure(lyrics: string): LyricsStructure {
  if (!lyrics || lyrics.trim().length === 0) {
    return {
      sections: [],
      hookRepetitions: 0,
      sentimentArc: [],
      hasTaggedStructure: false,
      totalSections: 0,
      dominantScheme: "-",
    };
  }

  const normalized = lyrics.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const tagPattern = /^\[([^\]]+)\]/;

  const lineArr = normalized.split("\n");
  const hasTaggedStructure = lineArr.some((l) => tagPattern.test(l.trim()));

  let rawSections: { label: string; lines: string[] }[] = [];

  if (hasTaggedStructure) {
    let currentLabel = "Intro";
    let currentLines: string[] = [];

    for (const line of lineArr) {
      const trimmed = line.trim();
      const match = trimmed.match(tagPattern);
      if (match) {
        if (currentLines.some((l) => l.trim().length > 0)) {
          rawSections.push({ label: currentLabel, lines: currentLines });
        }
        currentLabel = normalizeSectionLabel(match[1]);
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }
    if (currentLines.some((l) => l.trim().length > 0)) {
      rawSections.push({ label: currentLabel, lines: currentLines });
    }
  } else {
    const blocks: string[][] = [];
    let current: string[] = [];
    for (const line of lineArr) {
      if (line.trim().length === 0) {
        if (current.some((l) => l.trim().length > 0)) {
          blocks.push(current);
          current = [];
        }
      } else {
        current.push(line);
      }
    }
    if (current.some((l) => l.trim().length > 0)) blocks.push(current);

    const HEURISTIC_LABELS = ["Intro", "Verse 1", "Verse 2", "Chorus", "Verse 3", "Chorus", "Bridge", "Chorus", "Outro"];
    rawSections = blocks.map((lines, i) => ({
      label: HEURISTIC_LABELS[i] ?? `Section ${i + 1}`,
      lines,
    }));
  }

  if (rawSections.length === 0) {
    return {
      sections: [],
      hookRepetitions: 0,
      sentimentArc: [],
      hasTaggedStructure: false,
      totalSections: 0,
      dominantScheme: "-",
    };
  }

  const repKeyCount = new Map<string, number>();
  const sections: LyricsSection[] = rawSections.map((s) => {
    const lyricLines = s.lines.filter(
      (l) => l.trim().length > 0 && !tagPattern.test(l.trim())
    );
    const scheme = detectRhymeScheme(lyricLines);
    const sentiment = scoreSentiment(lyricLines);
    const isHook = isHookLabel(s.label);
    const rKey = buildRepetitionKey(lyricLines);
    repKeyCount.set(rKey, (repKeyCount.get(rKey) ?? 0) + 1);
    return { label: s.label, lines: lyricLines, rhymeScheme: scheme, sentiment, isHook, repetitionKey: rKey };
  });

  let hookRepetitions = 0;
  for (const s of sections) {
    if (s.isHook) {
      const cnt = repKeyCount.get(s.repetitionKey) ?? 1;
      hookRepetitions = Math.max(hookRepetitions, cnt);
    }
  }

  const sentimentArc = sections.map((s) => s.sentiment);

  return {
    sections,
    hookRepetitions,
    sentimentArc,
    hasTaggedStructure,
    totalSections: sections.length,
    dominantScheme: dominantScheme(sections),
  };
}
