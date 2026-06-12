export interface ParsedAmount {
  /** canonical form, e.g. "1234567.89" */
  canonical: string
  whole: string
  cents: string // exactly two digits, or '' when no decimal part was given
}

const CURRENCY_JUNK = /[$€£¥₹₩₽¤ \s]|(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|MXN|CNY)/gi

/**
 * Parse an amount the way a human wrote it. Handles 1,234,567.89 (en),
 * 1.234.567,89 (eu), 1 234 567,89, plain 1234567.89, leading symbols.
 * Returns null when the string is ambiguous or malformed — for money we
 * refuse to guess.
 */
export function parseAmount(raw: string): ParsedAmount | null {
  let s = raw.replace(CURRENCY_JUNK, '').trim()
  if (!s || !/^[\d.,]+$/.test(s)) return null

  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  let decimalSep = ''

  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? '.' : ','
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ','
    const parts = s.split(sep)
    const tail = parts[parts.length - 1]
    if (parts.length === 2 && tail.length !== 3) {
      decimalSep = sep // single separator with non-3-digit tail → decimal point
    } else if (parts.length === 2 && tail.length === 3) {
      // "1,234" / "1.234" — thousands or decimal? Genuinely ambiguous.
      // Why: a wrong guess here IS the disaster this tool exists to prevent,
      // so we make the user disambiguate instead of silently picking one.
      return null
    } else {
      // 3+ groups: must all be 3 digits after the first → grouping separator
      if (parts.slice(1).some((p) => p.length !== 3) || parts[0].length === 0 || parts[0].length > 3) return null
      decimalSep = ''
    }
  }

  let whole: string
  let cents = ''
  if (decimalSep) {
    const i = decimalSep === '.' ? lastDot : lastComma
    whole = s.slice(0, i)
    cents = s.slice(i + 1)
    if (!/^\d{1,2}$/.test(cents)) return null
    cents = cents.padEnd(2, '0')
  } else {
    whole = s
  }

  const groupSep = decimalSep === '.' ? ',' : decimalSep === ',' ? '.' : /[.,]/.test(whole) ? (whole.includes(',') ? ',' : '.') : ''
  if (groupSep) {
    const groups = whole.split(groupSep)
    if (groups.length > 1 && (groups[0].length > 3 || groups[0].length === 0 || groups.slice(1).some((g) => g.length !== 3))) {
      return null
    }
    whole = groups.join('')
  }
  if (!/^\d+$/.test(whole)) return null
  whole = whole.replace(/^0+(?=\d)/, '')

  return { canonical: cents ? `${whole}.${cents}` : whole, whole, cents }
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const SCALE = ['', ' thousand', ' million', ' billion', ' trillion']

function threeDigitsToWords(n: number): string {
  const parts: string[] = []
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`)
    n %= 100
  }
  if (n >= 20) {
    const t = TENS[Math.floor(n / 10)]
    parts.push(n % 10 ? `${t}-${ONES[n % 10]}` : t)
  } else if (n > 0) {
    parts.push(ONES[n])
  }
  return parts.join(' ')
}

export function integerToWords(s: string): string {
  if (!/^\d+$/.test(s) || s.length > 15) return ''
  if (/^0+$/.test(s)) return 'zero'
  const groups: number[] = []
  for (let i = s.length; i > 0; i -= 3) groups.unshift(Number(s.slice(Math.max(0, i - 3), i)))
  const parts: string[] = []
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === 0) continue
    parts.push(threeDigitsToWords(groups[i]) + SCALE[groups.length - 1 - i])
  }
  return parts.join(' ')
}

/** "1234567.89" → "one million two hundred thirty-four thousand five hundred sixty-seven and 89/100" */
export function amountToWords(a: ParsedAmount): string {
  const words = integerToWords(a.whole)
  if (!words) return ''
  return a.cents ? `${words} and ${a.cents}/100` : `${words} even`
}

/** display form with grouping: "1234567.89" → "1,234,567.89" */
export function formatAmount(a: ParsedAmount): string {
  const grouped = a.whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return a.cents ? `${grouped}.${a.cents}` : grouped
}
