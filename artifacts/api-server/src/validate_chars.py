#!/usr/bin/env python3
"""
Suno template character-count validator.

Reads JSON from stdin:
  { "styleOfMusic": "...", "lyrics": "...", "negativePrompt": "..." }

Writes JSON to stdout:
  {
    "valid": bool,
    "fields": {
      "styleOfMusic":   { "len": int, "min": 900, "max": 999,  "ok": bool },
      "lyrics":         { "len": int, "min": 4900, "max": 4999, "ok": bool },
      "negativePrompt": { "len": int, "min": 150, "max": 199,  "ok": bool }
    },
    "errors": ["styleOfMusic too short: 850 chars (need 900-999)", ...]
  }

Python len() counts Unicode code points, which matches Suno's server-side
counting more accurately than JavaScript .length (which counts UTF-16 code
units and double-counts emoji / characters outside the BMP).
"""

import sys
import json

LIMITS = {
    "styleOfMusic":   (900,  999),
    "lyrics":         (4900, 4999),
    "negativePrompt": (150,  199),
}

def validate(data: dict) -> dict:
    fields = {}
    errors = []

    for key, (lo, hi) in LIMITS.items():
        value = data.get(key, "")
        n = len(value)  # Unicode code points
        ok = lo <= n <= hi
        fields[key] = {"len": n, "min": lo, "max": hi, "ok": ok}
        if not ok:
            if n < lo:
                errors.append(f"{key} too short: {n} chars (need {lo}–{hi})")
            else:
                errors.append(f"{key} too long: {n} chars (need {lo}–{hi})")

    return {
        "valid": len(errors) == 0,
        "fields": fields,
        "errors": errors,
    }

if __name__ == "__main__":
    try:
        data = json.load(sys.stdin)
        result = validate(data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"valid": False, "fields": {}, "errors": [f"validator error: {e}"]}))
        sys.exit(1)
