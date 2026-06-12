// Convert a speech transcript into text that extractCandidates can scan:
// spoken digit words become digits ("zero two one" → "021"), spoken
// punctuation becomes punctuation, everything else stays words.

const WORD_DIGITS: Record<string, string> = {
  zero: '0', oh: '0', o: '0',
  one: '1', won: '1',
  two: '2', to: '2', too: '2',
  three: '3',
  four: '4', for: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8', ate: '8',
  nine: '9', niner: '9',
}

const WORD_PUNCT: Record<string, string> = {
  dash: '-', hyphen: '-', minus: '-',
  dot: '.', point: '.', period: '.',
  slash: '/',
}

export function normalizeSpoken(transcript: string): string {
  const words = transcript.toLowerCase().replace(/[.,!?;:]/g, ' ').split(/\s+/).filter(Boolean)
  let out = ''
  for (const w of words) {
    if (WORD_DIGITS[w] !== undefined) out += WORD_DIGITS[w]
    else if (WORD_PUNCT[w] !== undefined) out += WORD_PUNCT[w]
    else if (/^[\d-]+$/.test(w)) out += w // recognizer often emits digit runs directly
    else out += ` ${w} `
  }
  return out.replace(/\s+/g, ' ').trim()
}
