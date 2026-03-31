/**
 * Intelligent Prompt Optimizer — client-side scoring engine.
 * Scores a generated Suno template against Suno best practices and returns
 * structured issues + auto-fix suggestions.
 */

export interface ScoringIssue {
  id: string;
  category: "style" | "lyrics" | "negative" | "conflicts" | "dimensions" | "cliches" | "balance";
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
  autoFixLyrics: string | null;
  autoFixStyleClicheFree: string | null;
}

export const ANTI_CLICHE_WORDS = [
  "pulsating", "ethereal tapestry", "sonic journey", "haunting melody",
  "sonic landscape", "musical tapestry", "immersive experience", "captivating",
  "mesmerizing", "transcendent", "otherworldly", "hypnotic", "ethereal",
  "lush tapestry", "sonic palette", "evocative", "ineffable", "sumptuous",
  "gossamer", "shimmering tapestry", "wistful reverie",
];

export const CONFLICT_PAIRS: ConflictPair[] = [
  { a: "aggressive", b: "gentle", reason: "Contradictory energy levels" },
  { a: "lo-fi", b: "crisp", reason: "Lo-fi and crisp studio production are mutually exclusive" },
  { a: "lo-fi", b: "studio production", reason: "Lo-fi aesthetics conflict with polished studio production" },
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
  { a: "jazz", b: "heavy metal", reason: "Straight jazz and heavy metal rarely coexist" },
  { a: "bluegrass", b: "edm drop", reason: "Bluegrass and EDM drops are stylistically incompatible" },
  { a: "baroque", b: "trap", reason: "Baroque classical and trap production clash" },
  { a: "bossa nova", b: "industrial", reason: "Bossa nova and industrial noise conflict heavily" },
  { a: "smooth", b: "harsh noise", reason: "Smooth and harsh noise are opposing textures" },
];

const MISSING_DIMENSION_CHECKS = [
  {
    id: "missing-tempo",
    patterns: [/\b\d{2,3}\s*bpm\b/i, /\btempo\b/i, /\ballad\b/i, /\buptempo\b/i, /\bfast\b/i, /\bslow\b/i, /\bgroove\b/i, /\bhyper\b/i, /\bpace\b/i, /\bmid[\s-]?tempo\b/i],
    title: "No tempo descriptor found",
    detail: "Style prompt lacks a tempo indicator — add a BPM value or tempo adjective (e.g. '128 BPM', 'uptempo', 'slow ballad')",
    fix: "Add tempo: e.g. append '128 BPM, uptempo groove' to your style prompt",
  },
  {
    id: "missing-key",
    patterns: [/\b[A-G][b#]?\s*(major|minor|maj|min)\b/i, /\bkey\s+of\b/i, /\bminor key\b/i, /\bmajor key\b/i, /\bminor mode\b/i, /\bmajor mode\b/i, /\bdorian\b/i, /\bphrygian\b/i, /\blydian\b/i, /\bmixolydian\b/i, /\bpentatonic\b/i],
    title: "No key or mode specified",
    detail: "Adding a key/mode (e.g. 'A minor', 'Eb major', 'Dorian mode') helps Suno target the right harmonic feel",
    fix: "Add key/mode: e.g. append 'A minor key' or 'Eb major tonality'",
  },
  {
    id: "missing-instrument",
    patterns: [/\bpiano\b/i, /\bguitar\b/i, /\bsynth\b/i, /\bdrums\b/i, /\bbass\b/i, /\bstrings\b/i, /\bkeys\b/i, /\bviolin\b/i, /\borchestra\b/i, /\bchoir\b/i, /\bhorn\b/i, /\btrombone\b/i, /\bsaxophone\b/i, /\bflute\b/i, /\bpad\b/i, /\blead synth\b/i, /\btrap hi-hat\b/i, /\b808\b/i, /\bmellotron\b/i, /\baccordion\b/i, /\bbanjo\b/i, /\bharp\b/i, /\bukulele\b/i, /\bvibraphone\b/i, /\btuba\b/i, /\bclarinet\b/i, /\bpercussion\b/i],
    title: "No primary instrument mentioned",
    detail: "Listing 1–2 primary instruments helps Suno build the right sonic palette",
    fix: "Add instrument: e.g. append 'driven by piano' or 'heavy synth lead'",
  },
  {
    id: "missing-era",
    patterns: [/\b(19[5-9]\d|20[0-2]\d)s?\b/, /\bmodern\b/i, /\bretro\b/i, /\bclassic\b/i, /\bvintage\b/i, /\bcontemporary\b/i, /\b(80s|90s|70s|60s|50s|2000s|2010s|2020s)\b/i, /\bnew wave\b/i, /\banalog\b/i, /\bdigital era\b/i, /\bpre-digital\b/i, /\bnineties\b/i, /\beighties\b/i],
    title: "No era or decade reference",
    detail: "Adding a decade cue (e.g. '80s production', 'modern streaming-era') anchors Suno's production style",
    fix: "Add era: e.g. append '80s analog warmth' or 'modern production'",
  },
  {
    id: "missing-vocal-style",
    patterns: [/\bvocal\b/i, /\bvoice\b/i, /\bsinger\b/i, /\bmale\b/i, /\bfemale\b/i, /\btenor\b/i, /\bsoprano\b/i, /\bbaritone\b/i, /\bchoir\b/i, /\brap\b/i, /\bscream\b/i, /\bno vocal\b/i, /\binstrumental\b/i, /\bduet\b/i, /\bcall.and.response\b/i, /\bharmor\b/i, /\bfalset\b/i, /\bwhisper\b/i],
    title: "No vocal style mentioned",
    detail: "Specifying a vocal style (e.g. 'female lead vocals', 'no vocals', 'male baritone') prevents Suno from guessing",
    fix: "Add vocal style: e.g. append 'female lead vocals' or 'no vocals, instrumental'",
  },
  {
    id: "missing-production-texture",
    patterns: [/\bdry\b/i, /\bwet\b/i, /\breverb\b/i, /\broom\b/i, /\blo-fi\b/i, /\bhi-fi\b/i, /\bcrunch\b/i, /\bcompressed\b/i, /\bwarm\b/i, /\bbright\b/i, /\bdark mix\b/i, /\bpolished\b/i, /\braw\b/i, /\bproduction\b/i, /\bcold\b/i, /\bclean\b/i, /\bdirty\b/i, /\bsaturated\b/i, /\bvintage mix\b/i, /\btape\b/i],
    title: "No production texture specified",
    detail: "Adding mix texture cues (e.g. 'warm reverb', 'dry compressed', 'tape saturation') shapes Suno's audio processing",
    fix: "Add texture: e.g. append 'warm reverb, lush room sound' or 'dry compressed signal chain'",
  },
  {
    id: "missing-energy",
    patterns: [/\benergy\b/i, /\bchill\b/i, /\bintense\b/i, /\bquiet\b/i, /\bloud\b/i, /\bdynamic\b/i, /\bpowerful\b/i, /\bsoft\b/i, /\bhigh.energy\b/i, /\blow.energy\b/i, /\bgain\b/i, /\bdriving\b/i, /\bdriven\b/i, /\brelaxed\b/i, /\bbuilding\b/i, /\banthem\b/i],
    title: "No energy level descriptor",
    detail: "Energy descriptors (e.g. 'high energy', 'chill and laid-back', 'intense driving') guide Suno's arrangement density",
    fix: "Add energy: e.g. append 'high energy driving rhythm' or 'chill laid-back vibe'",
  },
  {
    id: "missing-mood",
    patterns: [/\bmood\b/i, /\bdark\b/i, /\bhappy\b/i, /\bsad\b/i, /\bmelanchol\b/i, /\beuphor\b/i, /\bromantic\b/i, /\baggressive\b/i, /\bdreamy\b/i, /\bnostalg\b/i, /\bmyster\b/i, /\bcinemat\b/i, /\bplayful\b/i, /\bbitter\b/i, /\bbrooding\b/i, /\bjoyful\b/i, /\bengag\b/i, /\bintim\b/i, /\bpowerful\b/i, /\bsoul\b/i],
    title: "No mood or emotional tone specified",
    detail: "Mood descriptors (e.g. 'melancholic and introspective', 'euphoric and uplifting') shape Suno's emotional output",
    fix: "Add mood: e.g. append 'melancholic introspective tone' or 'euphoric uplifting energy'",
  },
];

export function detectConflicts(styleText: string): ConflictPair[] {
  const lower = styleText.toLowerCase();
  return CONFLICT_PAIRS.filter((pair) => {
    const hasA = lower.includes(pair.a.toLowerCase());
    const hasB = lower.includes(pair.b.toLowerCase());
    return hasA && hasB;
  });
}

export function detectCliches(text: string): string[] {
  const lower = text.toLowerCase();
  return ANTI_CLICHE_WORDS.filter((w) => lower.includes(w.toLowerCase()));
}

function removeClichesFromText(text: string, cliches: string[]): string {
  let result = text;
  for (const cliche of cliches) {
    const escapedCliche = cliche.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(,\\s*${escapedCliche}|${escapedCliche}\\s*,?\\s*)`,
      "gi"
    );
    result = result.replace(re, "");
  }
  return result.replace(/,\s*,/g, ",").replace(/^,\s*/, "").replace(/,\s*$/, "").trim();
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

/** Section balance analysis: check chorus/hook density vs verse breathing room */
function checkSectionBalance(lyrics: string): ScoringIssue[] {
  if (!lyrics || lyrics.length < 100) return [];

  const lines = lyrics.split("\n");
  const issues: ScoringIssue[] = [];

  const sectionBlocks: { type: "hook" | "verse" | "bridge" | "other"; lines: string[] }[] = [];
  let currentType: "hook" | "verse" | "bridge" | "other" = "other";
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[(chorus|hook|refrain)/i.test(trimmed)) {
      if (currentLines.length > 0) sectionBlocks.push({ type: currentType, lines: currentLines });
      currentType = "hook";
      currentLines = [];
    } else if (/^\[(verse|strophe)/i.test(trimmed)) {
      if (currentLines.length > 0) sectionBlocks.push({ type: currentType, lines: currentLines });
      currentType = "verse";
      currentLines = [];
    } else if (/^\[(bridge|pre-?chorus|outro|intro|breakdown)/i.test(trimmed)) {
      if (currentLines.length > 0) sectionBlocks.push({ type: currentType, lines: currentLines });
      currentType = "bridge";
      currentLines = [];
    } else if (trimmed !== "") {
      currentLines.push(trimmed);
    }
  }
  if (currentLines.length > 0) sectionBlocks.push({ type: currentType, lines: currentLines });

  const hookBlocks = sectionBlocks.filter((b) => b.type === "hook");
  const verseBlocks = sectionBlocks.filter((b) => b.type === "verse");

  if (hookBlocks.length === 0 && verseBlocks.length === 0) {
    return [];
  }

  if (hookBlocks.length > 0) {
    const avgHookLines = hookBlocks.reduce((s, b) => s + b.lines.length, 0) / hookBlocks.length;
    const avgHookChars = hookBlocks.reduce((s, b) => s + b.lines.join("").length, 0) / hookBlocks.length;

    if (avgHookLines < 3 || avgHookChars < 80) {
      issues.push({
        id: "balance-hook-sparse",
        category: "balance",
        severity: "warning",
        title: `Chorus/Hook sections are sparse (avg ${Math.round(avgHookLines)} lines)`,
        detail: "Suno expects dense notation in Chorus/Hook sections for strong repetition. Aim for 4–8 lines with production cues.",
        autoFixable: false,
      });
    }
  }

  if (verseBlocks.length > 0) {
    const avgVerseLines = verseBlocks.reduce((s, b) => s + b.lines.length, 0) / verseBlocks.length;

    if (avgVerseLines > 16) {
      issues.push({
        id: "balance-verse-dense",
        category: "balance",
        severity: "info",
        title: `Verse sections are very long (avg ${Math.round(avgVerseLines)} lines)`,
        detail: "Long verses reduce breathing room. Suno performs better with verses of 6–12 lines and explicit (breathing) performance cues.",
        autoFixable: false,
      });
    }

    if (avgVerseLines < 3) {
      issues.push({
        id: "balance-verse-sparse",
        category: "balance",
        severity: "warning",
        title: `Verse sections are very sparse (avg ${Math.round(avgVerseLines)} lines)`,
        detail: "Verses under 3 lines lack enough lyrical space for Suno to build an arrangement. Aim for 4–10 lines per verse.",
        autoFixable: false,
      });
    }
  }

  if (hookBlocks.length > 0 && verseBlocks.length > 0) {
    const hookDensity = hookBlocks.reduce((s, b) => s + b.lines.join(" ").length / Math.max(1, b.lines.length), 0) / hookBlocks.length;
    const verseDensity = verseBlocks.reduce((s, b) => s + b.lines.join(" ").length / Math.max(1, b.lines.length), 0) / verseBlocks.length;

    if (hookDensity < verseDensity * 0.6) {
      issues.push({
        id: "balance-hook-vs-verse",
        category: "balance",
        severity: "info",
        title: "Chorus lines shorter than verse lines",
        detail: "Chorus/Hook lines should be punchier and denser than verse lines for stronger repetition impact in Suno.",
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

function scoreLyricsLength(lyrics: string): { issues: ScoringIssue[]; score: number; autoFixValue?: string } {
  const len = lyrics.length;
  const issues: ScoringIssue[] = [];
  let score = 20;
  let autoFixValue: string | undefined;

  if (len > 4999) {
    score = 0;
    autoFixValue = lyrics.slice(0, 4999);
    issues.push({
      id: "lyrics-overlimit",
      category: "lyrics",
      severity: "error",
      title: `Lyrics ${len} chars — over 4,999 limit (by ${len - 4999})`,
      detail: "Suno will reject lyrics over 4,999 characters. Click Fix All to truncate.",
      autoFixable: true,
      autoFixValue,
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

  return { issues, score, autoFixValue };
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
      detail: `At ${len} chars, some exclusions may be dropped. Click Fix All to truncate.`,
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
  const deductionPerConflict = 7;
  const deduction = Math.min(25, conflicts.length * deductionPerConflict);
  return { score: 25 - deduction };
}

function scoreCliches(style: string, lyrics: string): {
  issues: ScoringIssue[];
  score: number;
  cliches: string[];
  autoFixStyleClicheFree: string | null;
} {
  const cliches = detectCliches(style + " " + lyrics);
  const issues: ScoringIssue[] = [];
  let score = 10;
  let autoFixStyleClicheFree: string | null = null;

  const styleCliches = ANTI_CLICHE_WORDS.filter((w) =>
    style.toLowerCase().includes(w.toLowerCase())
  );

  if (cliches.length > 0 && styleCliches.length > 0) {
    const cleaned = removeClichesFromText(style, styleCliches);
    if (cleaned !== style) autoFixStyleClicheFree = cleaned;
  }

  if (cliches.length === 0) {
    score = 10;
  } else if (cliches.length <= 2) {
    score = 6;
    issues.push({
      id: "cliches-few",
      category: "cliches",
      severity: "warning",
      title: `${cliches.length} cliché phrase${cliches.length > 1 ? "s" : ""} detected`,
      detail: `Found: ${cliches.join(", ")}. These produce vague Suno output.`,
      fix: autoFixStyleClicheFree !== null ? "Click Fix All to remove from style prompt automatically." : "Regenerate the style section for better specificity.",
      autoFixable: autoFixStyleClicheFree !== null,
      autoFixValue: autoFixStyleClicheFree ?? undefined,
    });
  } else {
    score = 0;
    issues.push({
      id: "cliches-many",
      category: "cliches",
      severity: "error",
      title: `${cliches.length} cliché phrases detected in style/lyrics`,
      detail: `Found: ${cliches.join(", ")}. Generic AI phrases make Suno output generic.`,
      fix: autoFixStyleClicheFree !== null ? "Click Fix All to remove from style prompt automatically." : "Regenerate the style section.",
      autoFixable: autoFixStyleClicheFree !== null,
      autoFixValue: autoFixStyleClicheFree ?? undefined,
    });
  }

  return { issues, score, cliches, autoFixStyleClicheFree };
}

function scoreDimensions(dimIssues: ScoringIssue[]): { score: number } {
  const totalDims = MISSING_DIMENSION_CHECKS.length;
  const missingCount = dimIssues.length;
  const score = Math.max(0, 10 - Math.round((missingCount / totalDims) * 10));
  return { score };
}

function scoreSectionBalance(balanceIssues: ScoringIssue[]): { score: number } {
  const errorCount = balanceIssues.filter((i) => i.severity === "error").length;
  const warnCount = balanceIssues.filter((i) => i.severity === "warning").length;
  const deduction = errorCount * 4 + warnCount * 2;
  return { score: Math.max(0, 10 - deduction) };
}

export function scoreTemplate(template: {
  styleOfMusic: string;
  lyrics: string;
  negativePrompt: string;
}): PromptScore {
  const { styleOfMusic, lyrics, negativePrompt } = template;

  const conflicts = detectConflicts(styleOfMusic);
  const dimIssues = checkMissingDimensions(styleOfMusic);
  const balanceIssues = checkSectionBalance(lyrics);

  const { issues: styleIssues, score: styleScore } = scoreStyleLength(styleOfMusic);
  const { issues: lyricsIssues, score: lyricsScore, autoFixValue: lyricsAutoFix } = scoreLyricsLength(lyrics);
  const { issues: negIssues, score: negScore } = scoreNegativeLength(negativePrompt);
  const { score: conflictScore } = scoreConflicts(conflicts);
  const { issues: clicheIssues, score: clicheScore, autoFixStyleClicheFree } = scoreCliches(styleOfMusic, lyrics);
  const { score: dimScore } = scoreDimensions(dimIssues);
  const { score: balanceScore } = scoreSectionBalance(balanceIssues);

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
    ...balanceIssues,
  ];

  const totalMax = 20 + 20 + 15 + 25 + 10 + 10 + 10;
  const rawTotal = styleScore + lyricsScore + negScore + conflictScore + clicheScore + dimScore + balanceScore;
  const overall = Math.round(Math.max(0, Math.min(100, (rawTotal / totalMax) * 100)));

  const categories: Record<string, CategoryScore> = {
    style: { label: "Style Prompt", score: styleScore, maxScore: 20, passed: styleScore >= 16 },
    lyrics: { label: "Lyrics Length", score: lyricsScore, maxScore: 20, passed: lyricsScore === 20 },
    negative: { label: "Negative Prompt", score: negScore, maxScore: 15, passed: negScore === 15 },
    conflicts: { label: "Tag Conflicts", score: conflictScore, maxScore: 25, passed: conflictScore === 25 },
    cliches: { label: "Cliché Check", score: clicheScore, maxScore: 10, passed: clicheScore === 10 },
    dimensions: { label: "Musical Dimensions", score: dimScore, maxScore: 10, passed: dimScore >= 8 },
    balance: { label: "Section Balance", score: balanceScore, maxScore: 10, passed: balanceScore >= 8 },
  };

  const styleFix = styleIssues.find((i) => i.autoFixable && i.autoFixValue !== undefined);
  const negFix = negIssues.find((i) => i.autoFixable && i.autoFixValue !== undefined);

  return {
    overall,
    categories,
    issues: allIssues,
    conflicts,
    autoFixStyle: styleFix?.autoFixValue ?? null,
    autoFixNegative: negFix?.autoFixValue ?? null,
    autoFixLyrics: lyricsAutoFix ?? null,
    autoFixStyleClicheFree,
  };
}
