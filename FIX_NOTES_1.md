# Inoob Autofill Bughunt — Fix Notes

## TL;DR

The paste-a-URL → autofill-the-fields pipeline **was never actually broken at the network layer** — backend endpoints work. The frontend was silently eating malformed AI responses because of a type-laundering bug in `applySuggestedControls`. Added a runtime-validated parser, fixed a TypeScript compile error, and tightened panel-visibility logic. Full monorepo typecheck + production build both green.

## Files changed

1. `lib/api-client-react/src/generated/api.schemas.ts` — 1 line
2. `artifacts/suno-generator/src/pages/Home.tsx` — ~150 lines net (parser added, applySuggestedControls rewritten, reorder)

No backend changes needed.

## The bugs

### Bug 1: Silent type laundering (the real killer)

```ts
// Before:
const applySuggestedControls = useCallback((raw: Record<string, unknown>) => {
  const data: SuggestedControls = {
    genres: raw.genres ?? [],          // unknown ?? [] is still unknown
    bpm: raw.bpm ?? null,              // unknown ?? null is still unknown
    era: raw.era ?? null,              // ← TypeScript was screaming all along
    ...
  };
```

TypeScript had been throwing `TS2740` and `TS2322` errors on lines 1018–1030 but the project shipped anyway (Vite dev server doesn't hard-fail on tsc errors). At runtime, whenever Gemini returned:

- `genres` as a comma-separated string instead of an array → `.slice()` crashed silently inside try/catch
- `bpm` as `"171"` (string) instead of `171` (number) → `data.bpm` truthy, `setBpmTarget(String(data.bpm))` rendered `"171"` correctly BUT the conditional `if (data.bpm)` failed for `bpm: 0`
- `era` as `"Modern"` (capitalized) → set as-is, but backend rejected it as enum mismatch
- `null`/`undefined` body → `raw.genres ?? []` returned `[]` but TS couldn't prove `.slice()` on it

**Fix:** A real runtime parser (`parseAutofillResponse`) at module scope that:
- Coerces every field with strict type guards (`asString`, `asStringArray`, `asNumberInRange`, `asEnum`)
- Splits comma-joined strings into arrays where expected
- Narrows enum values against the exact allowed set (`VALID_ERA`, `VALID_ENERGY`, etc.)
- Rejects out-of-range numbers
- Lower-cases enum inputs before checking (accepts `"Modern"` and `"modern"`)
- Returns a fully-shaped result with safe defaults, never throws

Covered by 19 unit tests, all passing.

### Bug 2: TypeScript build error in schema file

`lib/api-client-react/src/generated/api.schemas.ts` line 284 referenced `SunoVersion` (which doesn't exist) instead of `GenerateTemplateRequestSunoVersion` (which does, declared 80 lines above). This blocked `pnpm run typecheck:libs` from ever succeeding.

### Bug 3: Stale-closure churn on `excludeTags`

`applySuggestedControls` had `[excludeTags]` in its useCallback deps, and `fetchVideoPreview` had `[excludeTags, form]`. Every autofill that merged new excludeTags retriggered both callbacks, causing the URL `useEffect` to re-fire, restart loading state, re-debounce, and occasionally double-fetch.

**Fix:** Switched `setExcludeTags(prev => ...)` to functional form, removed `excludeTags` from both dep arrays. `applySuggestedControls` now has `[]` deps (truly stable), `fetchVideoPreview` has `[form, applySuggestedControls]`.

### Bug 4: Suno Lab panel stayed hidden when irrelevant

Old code only called `setShowSunoLab(true)` if bpm/chord/persona/dna/metaTags/pronunciation/sliders were ALL populated with specific fields. If the AI returned only style-control data (genres, moods, era), Suno Lab stayed collapsed — user thought "only half the autofill worked".

**Fix:** Always `setShowStyleControls(true)` when any autofill hits. Only open Suno Lab if its specific fields hit. Explicit, separated logic.

### Bug 5: TDZ ordering

`fetchVideoPreview` referenced `applySuggestedControls` but was declared *above* it. Worked at runtime because of async debounce, but blocked strict typecheck. Swapped the declaration order.

## Verification

```
$ pnpm run typecheck
Scope: 4 of 11 workspace projects
artifacts/mockup-sandbox typecheck: Done
artifacts/api-server typecheck: Done
artifacts/suno-generator typecheck: Done
scripts typecheck: Done

$ pnpm --filter @workspace/suno-generator run build
✓ 2797 modules transformed
✓ built in 25.63s

$ npx tsx test-parser.ts
19 passed, 0 failed
```

## What autofills when you paste a URL

After this fix, every field in `SuggestedControls` that the backend returns with valid data flows into the UI deterministically:

**Style Controls panel (always opens):**
- Vocals — `data.vocals` → `setVocalGender`
- Energy — `data.energy` → `setEnergyLevel`
- Era — `data.era` → `setEra`
- Tempo — `data.tempo` → `setTempo`
- Moods (pick 4) — `data.moods` → `setSelectedMoods`
- Instruments (pick 5) — `data.instruments` → `setSelectedInstruments`
- Genres (pick 5) — `data.genres` → `setSelectedGenres`
- Genre nudge — `data.genreNudge` (falls back to `data.vibeDescription`) → `setGenreNudge`

**Mood Board (opens via MoodBoard's internal `useEffect` on `externalVibe`):**
- Vibe description textarea — `data.vibeDescription` → seeded into MoodBoard's internal state via the `externalVibe` prop

**Suno Lab panel (opens if any of these come back):**
- BPM Anchor — `data.bpm` → `setBpmTarget`
- Chord progression — `data.chordProgression` → `setChordProgression`
- Vocal persona prompt — `data.vocalPersona` → `setVocalPersona`
- Sonic DNA prompt — `data.sonicDna` → `setSonicDna`
- Meta-Tags — `data.metaTags` → `setMetaTagsText` (joined with commas)
- Pronunciation guide — `data.pronunciationGuide` → `setPronunciationGuide`
- Sliders — `data.weirdness`, `data.styleInfluence`, `data.audioInfluence`

**Negative prompt builder (opens if `negativeHints` returned):**
- Known tags → pushed into `excludeTags` chips
- Custom hints → joined into `customExclusions` textarea

Every field shows an `AutoBadge` indicator and supports restore via `resetAutoFill`.

## Deployment

If you just want the fix as a patch instead of swapping the whole tree:

```bash
cd your-inoob-checkout
patch -p1 < autofill-fix.schemas.patch
patch -p1 < autofill-fix.home.patch
pnpm install
pnpm run typecheck
pnpm --filter @workspace/suno-generator run build
```

If you want the full fixed tree, unzip `inoob-autofill-fixed.zip` and run your normal Docker Compose workflow. No backend changes = no need to rebuild the api-server image unless you were already planning to.
