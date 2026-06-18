// Some sites don't use a normal password mask — they replace each character you
// type with a mask glyph in the VISIBLE field and keep the real value in a
// hidden input (e.g. IRS Direct Pay turns an SSN into "XXX-XX-XXXX"). The value
// we can read off that field is all X's/bullets, not the data — so comparing a
// re-typed value against it is meaningless. Detect it and fall back to
// double-entry instead.
const MASK_CHARS = new Set([...'xX•·●◦∙*＊✱#⦁○◌▪◾'])

export function looksMasked(raw: string): boolean {
  // strip the separators a real value might also contain
  const stripped = raw.replace(/[\s\-.()/]/g, '')
  // short strings risk false positives (a 2-char "XX" could be real); a masked
  // high-value field is always several glyphs long
  if (stripped.length < 4) return false
  return [...stripped].every((c) => MASK_CHARS.has(c))
}
