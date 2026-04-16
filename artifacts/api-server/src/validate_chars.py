#!/usr/bin/env python3
"""
Suno template character-count validator, trimmer, and padder.

Reads JSON from stdin:
  { "styleOfMusic": "...", "lyrics": "...", "negativePrompt": "..." }

Writes JSON to stdout:
  {
    "valid": bool,
    "trimmed": bool,            # true if any field was trimmed to fit
    "padded": bool,             # true if lyrics were padded up to minimum
    "fields": {
      "styleOfMusic":   { "original": int, "final": int, "min": 900,  "max": 999,  "ok": bool },
      "lyrics":         { "original": int, "final": int, "min": 4900, "max": 4999, "ok": bool },
      "negativePrompt": { "original": int, "final": int, "min": 150,  "max": 199,  "ok": bool }
    },
    "errors": [...],            # validation issues that could NOT be auto-fixed
    "data": {                   # corrected field values ready to use
      "styleOfMusic": "...",
      "lyrics": "...",
      "negativePrompt": "..."
    }
  }

Python len() counts Unicode code points, which is more accurate than
JavaScript .length (UTF-16 code units, double-counts emoji).
"""

import sys
import json
import itertools

LIMITS = {
    "styleOfMusic":   (900,  999),
    "lyrics":         (4900, 4999),
    "negativePrompt": (150,  199),
}

# ── Production-cue padding pool ───────────────────────────────────────────────
# These blocks are rotated and inserted when lyrics are too short.
# They use authentic Suno Metatag formatting so they blend with AI output.

_INSTRUMENTAL_SECTIONS = [
    """\n[Instrumental Bridge - layered textures, mid-song tension build, dynamic swell]
[Piano: sustained chord voicings, soft pedal, slight rubato feel]
[Strings: rising countermelody, legato bowing, harmonic overtones]
[Synth Pad: slow filter sweep, warm low-pass resonance, ambient shimmer]
[Bass: steady quarter-note pulse, slightly behind the beat, warm tone]
[Drums: brushed snare, light hi-hat pattern, minimal kick, textured ride]
(feel the space between the notes — let the room breathe)
(tension building, expectation held just a moment longer)
(the groove locks in — body and soul moving as one)""",

    """\n[Breakdown - stripped back, intimate, raw emotion on the surface]
[Guitar: single-note picking, open string resonance, gentle vibrato tail]
[Vocals: breathy, close-miked, no reverb, every consonant audible]
[Bass: sparse root notes, long sustain, almost imperceptible movement]
[Percussion: finger-snaps on 2 and 4, subtle room ambience only]
(close your eyes — hear only the truth in every syllable)
(vulnerability laid bare, no production armour left)
(this is the moment the listener leans in)""",

    """\n[Instrumental Interlude - groove-forward, rhythmically dense, hypnotic loop]
[Drums: syncopated kick pattern, ghost notes on snare, driving hi-hat sixteenths]
[Bass: locked with kick, funk-inflected ghost plucks between root notes]
[Rhodes: chordal stabs on the upbeat, subtle tremolo, warm saturation]
[Guitar: muted scratch rhythm, percussive attack, slight wah envelope]
[Synth Arp: sixteenth-note pattern, bright tone, panned left-to-right]
(let the rhythm carry you — stop thinking, just move)
(the pocket deepens — every instrument breathing together)
(hips, shoulders, head — the body finds the beat automatically)""",

    """\n[Pre-Chorus Build - harmonic lift, energy climbing, anticipation mounting]
[Strings: ascending run in thirds, accelerating into the chorus downbeat]
[Synth: filter opens slowly, resonance peak just before the drop]
[Drums: snare roll, crash on beat 1 of chorus, ride bell accents]
[Vocals: harmonised stack, three-part chord, growing in intensity]
[Bass: walking line up the scale, arriving on the root with force]
(something is about to break open — hold your breath)
(the chorus is coming — you can feel it in your chest)""",

    """\n[Bridge - tonal shift, new perspective, emotional recontextualisation]
[Key Change: lift by a minor third — same words, entirely different feeling]
[Piano: left-hand ostinato, right-hand melody in octaves, pedal sustain]
[Choir: wordless "ahh" backing, SATB voicing, cathedral reverb tail]
[Bass: simplified to root-fifth, half-note pulse, giving space above]
[Drums: half-time feel, snare on beat 3 only, hi-hat quarter notes]
(step back — see the whole arc of the story from here)
(what began as one thing has become something entirely else)
(this moment reframes everything that came before it)""",

    """\n[Instrumental Hook Recap - familiar melody returns, fuller arrangement]
[All instruments: full ensemble texture, maximum dynamic range]
[Guitar Lead: melodic hook from verse, now in upper register, with vibrato]
[Brass Section: sustained chord stabs, tight voicing, punchy attack]
[Strings: tremolo on sustained chord, building energy beneath the lead]
[Drums: four-on-the-floor kick, rim shot snare, open hi-hat splashes]
(the melody you know — but bigger, bolder, more certain of itself)
(the room fills completely — not a single frequency left empty)""",
]

_OUTRO_EXTENSIONS = [
    """\n[Extended Outro - gradual deconstruction, elements dropping away one by one]
[Full band to drums only: each instrument fades out over 8 bars]
[Drums: hi-hat pattern last to go, fading to a single distant tap]
[Bass: last note held, dying slowly into digital silence]
[Reverb tail: long natural room, 4+ seconds decay, no early reflections]
[Room tone: the sound of the space itself, lingering after the music]
(fade... slowly... until only the memory of the groove remains)
(the song ends but the feeling stays — held somewhere behind the sternum)
(silence arrives — and it feels earned)
[Fade Out]
[End]""",

    """\n[Reprise Outro - opening motif returns, bookending the journey]
[Solo Piano: opening theme, now slower, more deliberate, reflective]
[Vocal: single sustained note over piano, no vibrato, pure tone]
[Bass enters quietly: bowed, arco technique, very soft, very slow]
[Strings swell: from pianissimo to mezzo-forte, then back down again]
[Final chord: all instruments together, held for 6 beats, then gone]
(we are back where we started — but we are not the same)
(the journey changed us — this ending proves it)
(breathe out — it is over — and it was worth every second)
[Fade Out]
[End]""",
]

_PERFORMANCE_DIRECTIONS = [
    "(close your eyes and let the bass frequency settle into your bones)",
    "(the tempo here is a living thing — it breathes, it flexes, it listens)",
    "(every performer holds back just enough to make the release more powerful)",
    "(this section lives in the space between the notes as much as in the notes themselves)",
    "(dynamic range is everything here — from a whisper to a roar, without warning)",
    "(the rhythm section is one organism — locked, telepathic, inevitable)",
    "(sing through the phrase, not just to the end of it — the line goes further than you think)",
    "(feel the sub-bass in the sternum, the hi-hats in the shoulders, the kick in the soles of your feet)",
    "(this is the moment the song earns its ending — play it like you know that)",
    "(commit to every note — there is no room for hesitation in this passage)",
    "(tension and release, tension and release — that is the only grammar music speaks)",
    "(the listener has been waiting for this moment since bar one — do not disappoint them)",
    "(breathe with the band — the whole ensemble inhales before the drop)",
    "(leave enough space that the silence becomes part of the arrangement)",
    "(the groove is already there — find it, don't force it)",
]

_CYCLE_INSTRUMENTAL = itertools.cycle(_INSTRUMENTAL_SECTIONS)
_CYCLE_OUTRO = itertools.cycle(_OUTRO_EXTENSIONS)
_CYCLE_DIRECTION = itertools.cycle(_PERFORMANCE_DIRECTIONS)


def _strip_tail_tags(text: str) -> tuple[str, str]:
    """Remove [Fade Out] / [End] from the tail; return (body, tail)."""
    tail_tokens = ["[End]", "[Fade Out]", "[Fade out]", "[FADE OUT]"]
    body = text
    tail_parts = []
    for tok in tail_tokens:
        idx = body.rfind(tok)
        if idx != -1:
            tail_parts.append((idx, tok))
            body = body[:idx].rstrip()
    tail_parts.sort()
    tail = "\n".join(t for _, t in tail_parts) if tail_parts else ""
    return body, tail


def pad_lyrics(text: str, target_min: int = 4900, target_max: int = 4975) -> str:
    """
    Deterministically pad `text` with authentic Suno production-cue blocks
    until len(text) >= target_min.  Never exceeds target_max so the trimmer
    can still make a clean cut if needed.
    Returns the padded text (unchanged if already >= target_min).
    """
    if len(text) >= target_min:
        return text

    body, tail = _strip_tail_tags(text)

    pass_count = 0
    while len(body) + len(tail) + 1 < target_min:
        remaining = target_min - (len(body) + len(tail) + 1)

        if pass_count % 5 == 4:
            # Every 5th block: inject a standalone performance direction
            block = "\n" + next(_CYCLE_DIRECTION)
        elif remaining > 400 or pass_count < 2:
            block = next(_CYCLE_INSTRUMENTAL)
        else:
            # Close to target — smaller block
            block = "\n" + next(_CYCLE_DIRECTION)

        body = body + block
        pass_count += 1

        # Safety valve
        if pass_count > 20:
            break

    result = (body + "\n" + tail).strip() if tail else body.strip()

    # Final hard trim to target_max (shouldn't be needed, but belt-and-braces)
    if len(result) > target_max:
        result = smart_trim(result, target_max, "\n")

    return result


def smart_trim(text: str, max_len: int, split_char: str) -> str:
    """Trim text to at most max_len code points, cutting at the last
    occurrence of split_char at or before max_len."""
    if len(text) <= max_len:
        return text
    sub = text[:max_len]
    idx = sub.rfind(split_char)
    if idx > max_len // 2:          # only use split if it's in the latter half
        return sub[:idx].rstrip()
    return sub.rstrip()


def process(data: dict) -> dict:
    out_data = {}
    fields = {}
    errors = []
    trimmed = False
    padded = False

    for key, (lo, hi) in LIMITS.items():
        value = data.get(key, "")
        original = len(value)

        # Trim if too long
        if original > hi:
            split = "\n" if key == "lyrics" else ","
            value = smart_trim(value, hi, split)
            trimmed = True

        # Pad lyrics if too short (Python-enforced — no AI needed)
        if key == "lyrics" and len(value) < lo:
            value = pad_lyrics(value, target_min=lo, target_max=hi - 20)
            padded = True

        final = len(value)
        ok = lo <= final <= hi
        fields[key] = {"original": original, "final": final, "min": lo, "max": hi, "ok": ok}

        if not ok and final < lo:
            errors.append(f"{key} too short after padding: {final} chars (need {lo}–{hi})")

        out_data[key] = value

    return {
        "valid": len(errors) == 0,
        "trimmed": trimmed,
        "padded": padded,
        "fields": fields,
        "errors": errors,
        "data": out_data,
    }


if __name__ == "__main__":
    try:
        data = json.load(sys.stdin)
        result = process(data)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"valid": False, "trimmed": False, "padded": False, "fields": {}, "errors": [f"validator error: {e}"], "data": {}}))
        sys.exit(1)
