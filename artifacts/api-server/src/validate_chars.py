#!/usr/bin/env python3
"""
Suno template character-count validator and trimmer.

Reads JSON from stdin:
  { "styleOfMusic": "...", "lyrics": "...", "negativePrompt": "..." }

Writes JSON to stdout:
  {
    "valid": bool,
    "trimmed": bool,            # true if any field was trimmed to fit
    "fields": {
      "styleOfMusic":   { "original": int, "final": int, "min": 900,  "max": 999,  "ok": bool },
      "lyrics":         { "original": int, "final": int, "min": 4900, "max": 4999, "ok": bool },
      "negativePrompt": { "original": int, "final": int, "min": 150,  "max": 199,  "ok": bool }
    },
    "errors": [...],            # validation issues that could NOT be auto-fixed (too short)
    "data": {                   # trimmed/validated field values ready to use
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

LIMITS = {
    "styleOfMusic":   (900,  999),
    "lyrics":         (4900, 4999),
    "negativePrompt": (150,  199),
}


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

    for key, (lo, hi) in LIMITS.items():
        value = data.get(key, "")
        original = len(value)

        # Trim if too long
        if original > hi:
            split = "\n" if key == "lyrics" else ","
            value = smart_trim(value, hi, split)
            trimmed = True

        final = len(value)
        ok = lo <= final <= hi
        fields[key] = {"original": original, "final": final, "min": lo, "max": hi, "ok": ok}

        if not ok and final < lo:
            errors.append(f"{key} too short: {final} chars (need {lo}–{hi})")
        # too-long errors are auto-fixed by trim, so no error entry for those

        out_data[key] = value

    return {
        "valid": len(errors) == 0,
        "trimmed": trimmed,
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
        print(json.dumps({"valid": False, "trimmed": False, "fields": {}, "errors": [f"validator error: {e}"], "data": {}}))
        sys.exit(1)
