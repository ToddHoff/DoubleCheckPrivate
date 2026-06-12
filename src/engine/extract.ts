import type { Validator } from './types'
import { validate } from './spec'

// common OCR confusions when the format expects digits
const OCR_DIGIT_FIXES: Array<[RegExp, string]> = [
  [/[Oo]/g, '0'],
  [/[lI|]/g, '1'],
  [/S/g, '5'],
  [/B/g, '8'],
  [/Z/g, '2'],
]

/**
 * Pull candidate values matching a format out of OCR'd text.
 * `matches` are valid (normalized, deduped); `nears` look close but fail
 * validation — shown to the user as "did you mean", never auto-used.
 */
export function extractCandidates(text: string, v: Validator): { matches: string[]; nears: string[] } {
  const tokens = new Set<string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    tokens.add(line)
    for (const t of line.split(/\s+/)) if (t.length >= 2) tokens.add(t)
    for (const m of line.matchAll(/[\dOolIS|B][\dOolIS|B ,.\-/]*[\dOolIS|B]/g)) tokens.add(m[0])
  }

  const digitFormat = !!v.pattern && /^[^a-z]*\\d/.test(v.pattern)
  const matches = new Set<string>()
  const nears = new Set<string>()
  for (const t of tokens) {
    const r = validate(v, t)
    if (r.valid) {
      matches.add(r.normalized)
      continue
    }
    if (digitFormat) {
      let fixed = t
      for (const [re, sub] of OCR_DIGIT_FIXES) fixed = fixed.replace(re, sub)
      if (fixed !== t) {
        const r2 = validate(v, fixed)
        if (r2.valid) {
          matches.add(r2.normalized)
          continue
        }
      }
    }
    // close in length to the expected shape → worth showing as a near-miss
    if (v.length && r.normalized.length >= v.length.min && r.normalized.length <= v.length.max && r.normalized.length >= 4) {
      nears.add(r.normalized)
    }
  }
  for (const m of matches) nears.delete(m)
  return { matches: [...matches], nears: [...nears].slice(0, 5) }
}
