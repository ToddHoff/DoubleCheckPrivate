import type { ChecksumRef } from './types'

const digitsOf = (s: string) => [...s].map(Number)
const digitSum = (n: number) => (n >= 10 ? Math.floor(n / 10) + (n % 10) : n)

export function luhn(value: string): boolean {
  if (!/^\d{2,}$/.test(value)) return false
  let sum = 0
  const d = digitsOf(value)
  for (let i = d.length - 1, alt = false; i >= 0; i--, alt = !alt) {
    sum += alt ? digitSum(d[i] * 2) : d[i]
  }
  return sum % 10 === 0
}

/** ABA routing: 3·(d1+d4+d7) + 7·(d2+d5+d8) + (d3+d6+d9) ≡ 0 (mod 10) */
export function aba(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false
  const d = digitsOf(value)
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])
  return sum % 10 === 0
}

/** IBAN: move first 4 chars to end, A=10..Z=35, big-number mod 97 must be 1 */
export function mod97Iban(value: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(value)) return false
  const rearranged = value.slice(4) + value.slice(0, 4)
  let rem = 0
  for (const ch of rearranged) {
    const v = ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55)
    for (const digit of v) rem = (rem * 10 + Number(digit)) % 97
  }
  return rem === 1
}

// Damm quasigroup table (Damm 2004, the standard published table)
const DAMM = [
  [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
  [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
  [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
  [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
  [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
  [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
  [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
  [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
]

export function damm(value: string): boolean {
  if (!/^\d{2,}$/.test(value)) return false
  let interim = 0
  for (const d of digitsOf(value)) interim = DAMM[interim][d]
  return interim === 0
}

// Verhoeff dihedral-group tables
const V_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const V_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

export function verhoeff(value: string): boolean {
  if (!/^\d{2,}$/.test(value)) return false
  let c = 0
  const d = digitsOf(value).reverse()
  for (let i = 0; i < d.length; i++) c = V_D[c][V_P[i % 8][d[i]]]
  return c === 0
}

/** CLABE (Mexico): 18 digits; weights 3,7,1 cycled over first 17; term = (d·w) mod 10 */
export function clabe(value: string): boolean {
  if (!/^\d{18}$/.test(value)) return false
  const w = [3, 7, 1]
  const d = digitsOf(value)
  let sum = 0
  for (let i = 0; i < 17; i++) sum += (d[i] * w[i % 3]) % 10
  return (10 - (sum % 10)) % 10 === d[17]
}

const cusipCharValue = (ch: string): number => {
  if (ch >= '0' && ch <= '9') return Number(ch)
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55
  if (ch === '*') return 36
  if (ch === '@') return 37
  if (ch === '#') return 38
  return -1
}

export function cusip(value: string): boolean {
  if (!/^[A-Z0-9*@#]{9}$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 8; i++) {
    let v = cusipCharValue(value[i])
    if (v < 0) return false
    if (i % 2 === 1) v *= 2
    sum += Math.floor(v / 10) + (v % 10)
  }
  return (10 - (sum % 10)) % 10 === Number(value[8])
}

/** ISIN: letters→two digits (A=10..Z=35), then Luhn over the whole digit string */
export function isin(value: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value)) return false
  let digits = ''
  for (const ch of value) {
    digits += ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55)
  }
  return luhn(digits)
}

// VIN transliteration: I, O, Q are not allowed in VINs
const VIN_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

export function vin(value: string): boolean {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const ch = value[i]
    const v = ch >= '0' && ch <= '9' ? Number(ch) : VIN_VALUES[ch]
    if (v === undefined) return false
    sum += v * VIN_WEIGHTS[i]
  }
  const check = sum % 11
  return value[8] === (check === 10 ? 'X' : String(check))
}

export function weightedMod(
  value: string,
  opts: Extract<ChecksumRef, { algo: 'weighted-mod' }>,
): boolean {
  if (!/^\d{2,}$/.test(value)) return false
  const { weights, modulus, termTransform = 'none', mode = 'check-digit', direction = 'left' } = opts
  const d = digitsOf(value)
  const body = mode === 'check-digit' ? d.slice(0, -1) : d
  const indexed = direction === 'left' ? body : [...body].reverse()
  let sum = 0
  for (let i = 0; i < indexed.length; i++) {
    let term = indexed[i] * weights[i % weights.length]
    if (termTransform === 'mod10') term %= 10
    else if (termTransform === 'digit-sum') term = digitSum(term)
    sum += term
  }
  if (mode === 'sum-zero') return sum % modulus === 0
  return (modulus - (sum % modulus)) % modulus === d[d.length - 1]
}

export function runChecksum(value: string, ref: ChecksumRef): boolean {
  switch (ref.algo) {
    case 'luhn': return luhn(value)
    case 'aba': return aba(value)
    case 'mod97-iban': return mod97Iban(value)
    case 'damm': return damm(value)
    case 'verhoeff': return verhoeff(value)
    case 'clabe': return clabe(value)
    case 'cusip': return cusip(value)
    case 'isin': return isin(value)
    case 'vin': return vin(value)
    case 'weighted-mod': return weightedMod(value, ref)
  }
}

export const CHECKSUM_ALGOS = [
  'luhn', 'aba', 'mod97-iban', 'damm', 'verhoeff', 'clabe', 'cusip', 'isin', 'vin', 'weighted-mod',
] as const
