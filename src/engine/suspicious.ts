// Catch characters the eye can't — invisible/zero-width characters and
// look-alikes (a Cyrillic "а" pasted into an account number). These are
// classic sources of "the value looks right but fails" and a homoglyph
// attack vector. Surfaced as warnings on every format.

// zero-width, bidi, and other invisible formatting characters
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿­]/

// non-ASCII characters that look like ASCII letters/digits, → their look-alike
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', к: 'k', м: 'm',
  н: 'h', т: 't', в: 'b', і: 'i', ѕ: 's', ј: 'j', А: 'A', Е: 'E', О: 'O',
  Р: 'P', С: 'C', Х: 'X', В: 'B', М: 'M', Н: 'H', Т: 'T', К: 'K',
  І: 'I', Ј: 'J', Ѕ: 'S', У: 'Y',
  // Greek
  ο: 'o', Ο: 'O', Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K',
  Μ: 'M', Ν: 'N', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X', ν: 'v',
  // full-width digits and letters
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6',
  '７': '7', '８': '8', '９': '9',
}

/** warnings about deceptive characters in the RAW (pre-normalization) value */
export function suspiciousChars(raw: string): string[] {
  const warnings: string[] = []
  if (INVISIBLE.test(raw)) {
    warnings.push('Contains a hidden/invisible character — likely pasted from a document; retype it')
  }
  const found = new Set<string>()
  for (const ch of raw) {
    if (CONFUSABLES[ch]) found.add(ch)
  }
  if (found.size) {
    const list = [...found].map((c) => `“${c}” looks like “${CONFUSABLES[c]}”`).join(', ')
    warnings.push(`Contains a look-alike character (${list}) — not the ASCII letter it resembles`)
  }
  return warnings
}
