import type { NormalizeOp } from './types'

// Why: sources are messy — copy/paste brings non-breaking spaces, PDFs bring
// en/em/figure dashes, OCR brings both. Normalize the lookalikes too, or
// "identical" values fail comparison for invisible reasons.
const SPACE_RE = /[\s   ]+/g
const DASH_RE = /[-‐‑‒–—−]/g

export function applyNormalize(value: string, ops: NormalizeOp[]): string {
  let v = value
  for (const op of ops) {
    switch (op) {
      case 'trim': v = v.trim(); break
      case 'strip-spaces': v = v.replace(SPACE_RE, ''); break
      case 'strip-dashes': v = v.replace(DASH_RE, ''); break
      case 'strip-dots': v = v.replaceAll('.', ''); break
      case 'strip-parens': v = v.replace(/[()]/g, ''); break
      case 'uppercase': v = v.toUpperCase(); break
      case 'lowercase': v = v.toLowerCase(); break
    }
  }
  return v
}

/** chunk a value for display/speech: grouping [3,3,3] → "123 456 789"; last size cycles */
export function groupValue(value: string, grouping?: number[]): string {
  if (!grouping?.length) return value
  const parts: string[] = []
  let i = 0, g = 0
  while (i < value.length) {
    const size = grouping[Math.min(g, grouping.length - 1)]
    parts.push(value.slice(i, i + size))
    i += size
    g++
  }
  return parts.join(' ')
}
