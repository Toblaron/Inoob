/**
 * Intelligent Prompt Optimizer — client-side scoring engine.
 * Scores a generated Suno template against best practices and returns
 * structured issues + auto-fix suggestions.
 */

export interface ScoringIssue {
  id: string;
  category: "style" | "lyrics" | "negative" | "conflicts" | "dimensions" | "cliches";
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  fix?: string;
  autoFixable: boolean;
  autoFixValue?: string;
}

export interface ConflictPair {
  a: string;
  b: string;
  reason: string;
}

export interface CategoryScore {
  label: string;
  score: number;
  maxScore: number;
  passed: boolean;
}

export interface PromptScore {
  overall: number;
  categories: Record<string, CategoryScore>;
  issues: ScoringIssue[];
  conflicts: ConflictPair[];
  autoFixStyle: string | null;
  autoFixNegative: string | null;
}

const ANTI_CLICHE_WORDS = [
  "pulsating", "ethereal tapestry", "sonic journey", "haunting melody",
  "sonic landscape", "musical tapestry", "immersive experience", "captivating",
  "mesmerizing", "transcendent", "otherworldly", "hypnotic", "ethereal",
  "lush tapestry", "sonic palette", "evocative", "ineffable", "sumptuous",
  "gossamer", "shimmering tapestry", "wistful reverie",
];

const CONFLICT_PAIRS: ConflictPair[] = [
  { a: "aggressive", b: "gentle", reason: "Contradictory energy levels" },
  { a: "lo-fi", b: "crisp", reason: "Lo-fi and crisp studio production are mutually exclusive" },
  { a: "lo-fi", b: "studio", reason: "Lo-fi aesthetics conflict with polished studio production" },
  { a: "slow ballad", b: "bpm 160", reason: "BPM 160+ contradicts slow ballad tempo" },
  { a: "slow ballad", b: "bpm 145", reason: "BPM 145+ contradicts slow ballad tempo" },
  { a: "slow", b: "bpm 170", reason: "BPM 170 is too fast for slow tempo" },
  { a: "aggressive", b: "mellow", reason: "Contradictory intensity descriptors" },
  { a: "aggressive", b: "relaxing", reason: "Contradictory energy descriptors" },
  { a: "dark", b: "happy pop", reason: "Dark aesthetic conflicts with happy pop feel" },
  { a: "minimalist", b: "wall of sound", reason: "Minimalist production conflicts with wall-of-sound density" },
  { a: "acoustic", b: "heavily synthesized", reason: "Acoustic and heavily synthesized are contradictory" },
  { a: "acoustic", b: "edm", reason: "Acoustic and EDM production styles clash" },
  { a: "unplugged", b: "electronic", reason: "Unplugged acoustic conflicts with electronic production" },
  { a: "gospel choir", b: "no choir", reason: "Requesting choir and excluding choir simultaneously" },
  { a: "classical", b: "trap hi-hats", reason: "Classical and trap hi-hats are stylistically incompatible" },
  { a: "bebop", b: "edm", reason: "Bebop jazz and EDM are mutually exclusive production styles" },
  { a: "chillout", b: "intense", reason: "Chillout and intense energy are contradictory" },
  { a: "ambient", b: "high energy", reason: "Ambient and high energy production conflict" },
  { a: "ambient", b: "bpm 140", reason: "BPM 140+ is incompatible with ambient genre" },
  { a: "metal", b: "smooth jazz", reason: "Metal and smooth jazz are opposing genres" },
  { a: "country twang", b: "hip-hop", reason: "Country twang and hip-hop production conflict" },
  { a: "lullaby", b: "aggressive", reason: "Lullaby style conflicts with aggressive production" },
  { a: "whispered vocals", b: "powerful belting", reason: "Contradictory vocal delivery styles" },
  { a: "intimate", b: "stadium anthem", reason: "Intimate production conflicts with stadium anthem scale" },
  { a: "lo-fi", b: "4k production", reason: "Lo-fi and 4K ultra-clean production clash" },
  { a: "retro", b: "futuristic", reason: "Retro and futuristic aesthetics pull in opposite directions" },
  { a: "chamber music", b: "bass drop", reason: "Chamber music and bass drop are stylistically incompatible" },
  { a: "folk", b: "808 bass", reason: "Traditional folk and 808 bass conflict heavily" },
  { a: "classical orchestral", b: "distorted guitar", reason: "Classical orchestral typically excludes distorted guitar" },
  { a: "new age", b: "hardcore", reason: "New age meditation and hardcore energy are contradictory" },
];

const MISSING_DIMENSION_CHECKS = [
  {
    id: "missing-tempo",
    patterns: [/\b(\d{2,3})\s*bpm\b/i, /\btempo\b/i, /\ballad\b/i, /\buptempo\b/i, /\bfast\b/i, /\bslow\b/i, /\bgroove\b/i, /\bhyper\b/i, /\bpace\b/i],
    title: "No tempo descriptor found",
    detail: "Style prompt lacks a tempo indicator — add a BPM value or tempo adjective (e.g. '128 BPM', 'uptempo', 'slow ballad')",
    fix: "Add tempo: e.g. append '128 BPM, uptempo groove' to your style prompt",
  },
  {
    id: "missing-key",
    patterns: [/\b[A-G][b#]?\s*(major|minor|maj|min)\b/i, /\bkey\s+of\b/i, /\bminor key\b/i, /\bmajor key\b/i],
    title: "No key or mode specified",
    detail: "Adding a key/mode (e.g. 'A minor', 'Eb major') helps Suno target the right harmonic feel",
    fix: "Add key/mode: e.g. append 'A minor key' or 'Eb major tonality'",
  },
  {
    id: "missing-instrument",
    patterns: [/\bpiano\b/i, /\bguitar\b/i, /\bsynth\b/i, /\bdrums\b/i, /\bbass\b/i, /\bstrings\b/i, /\bkeys\b/i, /\bviolin\b/i, /\borchestra\b/i, /\bchoir\b/i, /\bhorn\b/i, /\btrombone\b/i, /\bsaxophone\b/i, /\bflute\b/i, /\bpad\b/i, /\blead\b/i, /\btrap\b/i, /\b808\b/i],
    title: "No primary instrument mentioned",
    detail: "Listing 1–2 primary instruments helps Suno build the right sonic palette",
    fix: "Add instrument: e.g. append 'driven by piano' or 'heavy synth lead'",
  },
  {
    id: "missing-era",
    patterns: [/\b(19[5-9]\d|20[0-2]\d)s?\b/, /\bmodern\b/i, /\bretro\b/i, /\bclassic\b/i, /\bvintage\b/i, /\bcontemporary\b/i, /\b(80s|90s|70s|60s|50s|2000s|2010s|2020s)\b/i, /\bnew wave\b/i, /\banalog\b/i, /\bdigital era\b/i],
    title: "No era or decade reference",
    detail: "Adding a decade cue (e.g. '80s production', 'modern streaming-era') anchors Suno's production style",
    fix: "Add era: e.g. append '80s analog warmth' or 'modern production'",
  },
];

const MISSING_DIMENSION_CATEGORIES = [
  "category:genre",
  "category:mood",
  "category:vocal",
];

function detectConflicts(styleText: string): ConflictPair[] {
  const lower = styleText.toLowerCase();
  return CONFLICT_PAIRS.filter((pair) => {
    const hasA = lower.includes(pair.a.toLowerCase());
    const hasB = lower.includes(pair.b.toLowerCase());
    return hasA && hasB;
  });
}

function detectCliches(text: string): string[] {
  const lower = text.toLowerCase();
  return ANTI_CLICHE_WORDS.filter((w) => lower.includes(w.toLowerCase()));
}

function checkMissingDimensions(style: string): ScoringIssue[] {
  const issues: ScoringIssue[] = [];
  for (const check of MISSING_DIMENSION_CHECKS) {
    const found = check.patterns.some((p) => p.test(style));
    if (!found) {
      issues.push({
        id: check.id,
        category: "dimensions",
        severity: "warning",
        title: check.title,
        detail: check.detail,
        fix: check.fix,
        autoFixable: false,
      });
    }
  }
  return issues;
}

function scoreStyleLength(style: string): { issues: ScoringIssue[]; score: number } {
  const len = style.length;
  const issues: ScoringIssue[] = [];
  let score = 20;

  if (len > 900) {
    score = 0;
    issues.push({
      id: "style-overlimit",
      category: "style",
      severity: "error",
      title: `Style prompt ${len} chars — over 900 limit`,
      detail: `Suno will truncate anything past 900 chars. You have ${len - 900} extra chars.`,
      autoFixable: true,
      autoFixValue: style.slice(0, 900),
    });
  } else if (len >= 850) {
    score = 20;
  } else if (len >= 700) {
    score = 16;
    issues.push({
      id: "style-underused",
      category: "style",
      severity: "warning",
      title: `Style prompt at ${len}/900 chars — ${900 - len} chars available`,
      detail: `You have ${900 - len} unused characters. Consider adding: reverb character, room size, mix bus treatment, or specific production techniques.`,
      autoFixable: false,
    });
  } else if (len >= 500) {
    score = 10;
    issues.push({
      id: "style-short",
      category: "style",
      severity: "warning",
      title: `Style prompt only ${len}/900 chars — significantly under-used`,
      detail: `Adding ${900 - len} more chars of specific detail improves Suno's output. Categories to add: sub-genre tags, production texture, vocal style, mixing notes.`,
      autoFixable: false,
    });
  } else {
    score = 5;
    issues.push({
      id: "style-very-short",
      category: "style",
      severity: "error",
      title: `Style prompt only ${len}/900 chars — severely under-used`,
      detail: `Only using ${Math.round((len / 900) * 100)}% of available style space. Expand with: specific genre variants, production era cues, instrumentation detail, vocal characteristics.`,
      autoFixable: false,
    });
  }

  return { issues, score };
}

function scoreLyricsLength(lyrics: string): { issues: ScoringIssue[]; score: number } {
  const len = lyrics.length;
  const issues: ScoringIssue[] = [];
  let score = 20;

  if (len > 4999) {
    score = 0;
    issues.push({
      id: "lyrics-overlimit",
      category: "lyrics",
      severity: "error",
      title: `Lyrics ${len} chars — over 4,999 limit (by ${len - 4999})`,
      detail: "Suno will reject lyrics over 4,999 characters. Regenerate the lyrics section.",
      autoFixable: true,
      autoFixValue: lyrics.slice(0, 4999),
    });
  } else if (len >= 4900) {
    score = 20;
  } else if (len >= 4500) {
    score = 14;
    issues.push({
      id: "lyrics-low",
      category: "lyrics",
      severity: "warning",
      title: `Lyrics ${len} chars — target is 4,900–4,999`,
      detail: `${4900 - len} chars below target minimum. Regenerate to expand with more production cue lines and performance directions.`,
      autoFixable: false,
    });
  } else {
    score = 5;
    issues.push({
      id: "lyrics-very-short",
      category: "lyrics",
      severity: "error",
      title: `Lyrics ${len} chars — well below 4,900 minimum`,
      detail: `Missing ${4900 - len} characters. Suno needs dense production cues and performance directions to fill this space.`,
      autoFixable: false,
    });
  }

  return { issues, score };
}

function scoreNegativeLength(neg: string): { issues: ScoringIssue[]; score: number } {
  const len = neg.length;
  const issues: ScoringIssue[] = [];
  let score = 15;

  if (len > 199) {
    score = 5;
    issues.push({
      id: "neg-overlimit",
      category: "negative",
      severity: "warning",
      title: `Negative prompt ${len} chars — over 199 target`,
      detail: `At ${len} chars, some exclusions may be dropped. Regenerate or trim manually.`,
      autoFixable: true,
      autoFixValue: neg.slice(0, 199),
    });
  } else if (len >= 180) {
    score = 15;
  } else if (len >= 120) {
    score = 10;
    issues.push({
      id: "neg-short",
      category: "negative",
      severity: "warning",
      title: `Negative prompt ${len} chars — target 180–199`,
      detail: `${180 - len} chars below ideal range. Regenerate to add more specific genre/instrument exclusions.`,
      autoFixable: false,
    });
  } else {
    score = 3;
    issues.push({
      id: "neg-very-short",
      category: "negative",
      severity: "error",
      title: `Negative prompt only ${len} chars — significantly under-filled`,
      detail: "A sparse negative prompt lets Suno fill in unwanted elements. Regenerate for better exclusion coverage.",
      autoFixable: false,
    });
  }

  return { issues, score };
}

function scoreConflicts(conflicts: ConflictPair[]): { score: number } {
  const deductionPerConflict = 8;
  const deduction = Math.min(25, conflicts.length * deductionPerConflict);
  return { score: 25 - deduction };
}

function scoreCliches(cliches: string[]): { issues: ScoringIssue[]; score: number } {
  const issues: ScoringIssue[] = [];
  let score = 10;

  if (cliches.length === 0) {
    score = 10;
  } else if (cliches.length <= 2) {
    score = 6;
    issues.push({
      id: "cliches-few",
      category: "cliches",
      severity: "warning",
      title: `${cliches.length} cliché phrase${cliches.length > 1 ? "s" : ""} detected`,
      detail: `Found: ${cliches.join(", ")}. These produce vague Suno output. Regenerate the style section.`,
      autoFixable: false,
    });
  } else {
    score = 0;
    issues.push({
      id: "cliches-many",
      category: "cliches",
      severity: "error",
      title: `${cliches.length} cliché phrases detected in style/lyrics`,
      detail: `Found: ${cliches.join(", ")}. Generic AI phrases make Suno output generic. Regenerate the style section.`,
      autoFixable: false,
    });
  }

  return { issues, score };
}

function scoreDimensions(dimIssues: ScoringIssue[]): { score: number } {
  const pointsPerMissing = 2.5;
  const deduction = Math.min(10, dimIssues.length * pointsPerMissing);
  return { score: 10 - deduction };
}

export function scoreTemplate(template: {
  styleOfMusic: string;
  lyrics: string;
  negativePrompt: string;
}): PromptScore {
  const { styleOfMusic, lyrics, negativePrompt } = template;

  const conflicts = detectConflicts(styleOfMusic);
  const cliches = detectCliches(styleOfMusic + " " + lyrics);
  const dimIssues = checkMissingDimensions(styleOfMusic);

  const { issues: styleIssues, score: styleScore } = scoreStyleLength(styleOfMusic);
  const { issues: lyricsIssues, score: lyricsScore } = scoreLyricsLength(lyrics);
  const { issues: negIssues, score: negScore } = scoreNegativeLength(negativePrompt);
  const { score: conflictScore } = scoreConflicts(conflicts);
  const { issues: clicheIssues, score: clicheScore } = scoreCliches(cliches);
  const { score: dimScore } = scoreDimensions(dimIssues);

  const conflictIssues: ScoringIssue[] = conflicts.map((c, i) => ({
    id: `conflict-${i}`,
    category: "conflicts" as const,
    severity: "warning" as const,
    title: `Tag conflict: "${c.a}" vs "${c.b}"`,
    detail: c.reason,
    autoFixable: false,
  }));

  const allIssues: ScoringIssue[] = [
    ...styleIssues,
    ...lyricsIssues,
    ...negIssues,
    ...conflictIssues,
    ...clicheIssues,
    ...dimIssues,
  ];

  const overall = Math.max(0, Math.min(100,
    styleScore + lyricsScore + negScore + conflictScore + clicheScore + dimScore
  ));

  const categories: Record<string, CategoryScore> = {
    style: { label: "Style Prompt", score: styleScore, maxScore: 20, passed: styleScore >= 16 },
    lyrics: { label: "Lyrics Length", score: lyricsScore, maxScore: 20, passed: lyricsScore === 20 },
    negative: { label: "Negative Prompt", score: negScore, maxScore: 15, passed: negScore === 15 },
    conflicts: { label: "Tag Conflicts", score: conflictScore, maxScore: 25, passed: conflictScore === 25 },
    cliches: { label: "Cliché Check", score: clicheScore, maxScore: 10, passed: clicheScore === 10 },
    dimensions: { label: "Musical Dimensions", score: dimScore, maxScore: 10, passed: dimScore === 10 },
  };

  const autoFixIssues = allIssues.filter((i) => i.autoFixable && i.autoFixValue !== undefined);
  const styleFix = autoFixIssues.find((i) => i.category === "style" && i.autoFixValue !== undefined);
  const negFix = autoFixIssues.find((i) => i.category === "negative" && i.autoFixValue !== undefined);

  return {
    overall,
    categories,
    issues: allIssues,
    conflicts,
    autoFixStyle: styleFix?.autoFixValue ?? null,
    autoFixNegative: negFix?.autoFixValue ?? null,
  };
}
