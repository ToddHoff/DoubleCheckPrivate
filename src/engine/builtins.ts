import type { Validator } from './types'
import { parseAmount, formatAmount, amountToWords } from './amount'
import { bitcoinAddressCheck, ethereumAddressCheck } from './crypto-addresses'

// IBAN registry lengths (total length incl. country code + check digits)
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27,
  JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25,
  MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28, NL: 18,
  NO: 15, OM: 23, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33,
  SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
}

// EIN prefixes the IRS never issues
const EIN_INVALID_PREFIXES = new Set([
  '00', '07', '08', '09', '17', '18', '19', '28', '29', '49', '69', '70', '78', '79', '89', '96', '97',
])

const ISO_COUNTRIES = new Set(
  ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
   'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
   'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
   'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
   'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
   'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
   'UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW').split(' '),
)

function ipv4Check(v: string): { errors: string[]; warnings: string[] } {
  const m = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return { errors: ['Expected four numbers 0–255 separated by dots'], warnings: [] }
  const errors: string[] = []
  const warnings: string[] = []
  for (const octet of m.slice(1)) {
    if (Number(octet) > 255) errors.push(`“${octet}” is more than 255`)
    if (octet.length > 1 && octet.startsWith('0')) {
      warnings.push(`Leading zero in “${octet}” — some systems read that as octal`)
    }
  }
  return { errors, warnings }
}

function ipv6Check(v: string): { errors: string[]; warnings: string[] } {
  const value = v.toLowerCase()
  if ((value.match(/::/g) ?? []).length > 1) return { errors: ['“::” can appear at most once'], warnings: [] }
  const countGroups = (side: string): number | null => {
    if (side === '') return 0
    let count = 0
    const parts = side.split(':')
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (i === parts.length - 1 && p.includes('.')) {
        // IPv4-mapped tail, e.g. ::ffff:192.168.0.1 — counts as two groups
        if (ipv4Check(p).errors.length) return null
        count += 2
      } else if (/^[0-9a-f]{1,4}$/.test(p)) {
        count += 1
      } else {
        return null
      }
    }
    return count
  }
  if (value.includes('::')) {
    const [left, right] = value.split('::')
    const l = countGroups(left)
    const r = countGroups(right)
    if (l === null || r === null) return { errors: ['Not a valid IPv6 address'], warnings: [] }
    if (l + r > 7) return { errors: ['Too many groups for an address using “::”'], warnings: [] }
  } else {
    const n = countGroups(value)
    if (n === null) return { errors: ['Not a valid IPv6 address'], warnings: [] }
    if (n !== 8) return { errors: [`IPv6 needs 8 groups, got ${n} (use “::” to compress zeros)`], warnings: [] }
  }
  return { errors: [], warnings: [] }
}

export function cardBrand(digits: string): string | null {
  if (/^4/.test(digits)) return 'Visa'
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'American Express'
  if (/^(6011|65|64[4-9])/.test(digits)) return 'Discover'
  if (/^35/.test(digits)) return 'JCB'
  if (/^3[068]/.test(digits)) return 'Diners Club'
  return null
}

function realDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false
  const days = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return d <= days[m - 1]
}

function dateValidator(id: string, name: string, order: 'mdy' | 'dmy' | 'ymd', pattern: string): Validator {
  return {
    id, name, builtin: true,
    normalize: ['trim'],
    pattern,
    speech: 'natural',
    extraCheck: (v) => {
      const parts = v.split(/[/.-]/).map(Number)
      const [y, m, d] =
        order === 'ymd' ? [parts[0], parts[1], parts[2]]
        : order === 'mdy' ? [parts[2], parts[0], parts[1]]
        : [parts[2], parts[1], parts[0]]
      const year = y < 100 ? 2000 + y : y
      return realDate(year, m, d) ? [] : [`Not a real calendar date (${name})`]
    },
  }
}

export const BUILTIN_VALIDATORS: Validator[] = [
  {
    id: 'aba-routing',
    name: 'US routing number (ABA)',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'strip-dashes'],
    pattern: '\\d{9}',
    length: { min: 9, max: 9 },
    checksum: { algo: 'aba' },
    grouping: [3, 3, 3],
    speech: 'char-by-char',
    notes: 'Nine digits with an internal check digit — a single wrong digit is caught mathematically.',
  },
  {
    id: 'us-bank-account',
    name: 'US bank account number',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'strip-dashes'],
    pattern: '\\d{4,17}',
    length: { min: 4, max: 17 },
    checksum: null,
    grouping: [4],
    speech: 'char-by-char',
    extraCheck: () => ({
      errors: [],
      warnings: ['US account numbers have no public checksum — double entry is the only real check'],
    }),
  },
  {
    id: 'iban',
    name: 'IBAN',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'strip-dashes', 'uppercase'],
    pattern: '[A-Z]{2}\\d{2}[A-Z0-9]{1,30}',
    checksum: { algo: 'mod97-iban' },
    grouping: [4],
    speech: 'char-by-char',
    extraCheck: (v) => {
      const cc = v.slice(0, 2)
      const expected = IBAN_LENGTHS[cc]
      if (!expected) return { errors: [], warnings: [`Unknown IBAN country code “${cc}” — length not verified`] }
      return expected === v.length
        ? []
        : [`${cc} IBANs are ${expected} characters, got ${v.length}`]
    },
  },
  {
    id: 'card',
    name: 'Payment card number',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'strip-dashes'],
    pattern: '\\d{12,19}',
    checksum: { algo: 'luhn' },
    grouping: [4],
    speech: 'char-by-char',
    extraCheck: (v) => {
      const brand = cardBrand(v)
      return brand ? [] : { errors: [], warnings: ['Unrecognized card network prefix'] }
    },
    format: (v) => {
      const grouped = v.replace(/(.{4})/g, '$1 ').trim()
      const brand = cardBrand(v)
      return brand ? `${grouped} (${brand})` : grouped
    },
  },
  {
    id: 'ssn',
    name: 'US Social Security number',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'strip-dashes'],
    pattern: '\\d{9}',
    length: { min: 9, max: 9 },
    checksum: null,
    grouping: [3, 2, 4],
    speech: 'char-by-char',
    extraCheck: (v) => {
      const area = v.slice(0, 3)
      const group = v.slice(3, 5)
      const serial = v.slice(5)
      const errors: string[] = []
      if (area === '000' || area === '666' || area >= '900') errors.push(`SSNs are never issued with area number ${area}`)
      if (group === '00') errors.push('SSN group number can’t be 00')
      if (serial === '0000') errors.push('SSN serial can’t be 0000')
      return errors
    },
  },
  {
    id: 'ein',
    name: 'US EIN (employer ID)',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'strip-dashes'],
    pattern: '\\d{9}',
    length: { min: 9, max: 9 },
    checksum: null,
    grouping: [2, 7],
    speech: 'char-by-char',
    extraCheck: (v) =>
      EIN_INVALID_PREFIXES.has(v.slice(0, 2)) ? [`The IRS never issues EINs starting with ${v.slice(0, 2)}`] : [],
  },
  {
    id: 'swift-bic',
    name: 'SWIFT / BIC code',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'uppercase'],
    pattern: '[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?',
    checksum: null,
    grouping: [4, 2, 2, 3],
    speech: 'char-by-char',
    extraCheck: (v) => {
      const cc = v.slice(4, 6)
      return ISO_COUNTRIES.has(cc) ? [] : [`“${cc}” isn’t an ISO country code (positions 5–6)`]
    },
  },
  {
    id: 'uk-sort-code',
    name: 'UK sort code',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'strip-dashes'],
    pattern: '\\d{6}',
    length: { min: 6, max: 6 },
    checksum: null,
    grouping: [2, 2, 2],
    speech: 'char-by-char',
  },
  {
    id: 'clabe',
    name: 'CLABE (Mexico)',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'strip-dashes'],
    pattern: '\\d{18}',
    length: { min: 18, max: 18 },
    checksum: { algo: 'clabe' },
    grouping: [3, 3, 11, 1],
    speech: 'char-by-char',
  },
  {
    id: 'currency-amount',
    name: 'Currency amount',
    builtin: true,
    normalize: ['trim'],
    checksum: null,
    speech: 'natural',
    canonicalize: (v) => {
      const parsed = parseAmount(v)
      if (!parsed) {
        return {
          error:
            'Couldn’t parse this amount unambiguously — check the decimal separator (e.g. “1,234” could be two different numbers)',
        }
      }
      return { value: parsed.canonical }
    },
    format: (v) => {
      const parsed = parseAmount(v)
      if (!parsed) return v
      const words = amountToWords(parsed)
      return words ? `${formatAmount(parsed)} — ${words}` : formatAmount(parsed)
    },
  },
  {
    id: 'cusip',
    name: 'CUSIP (US security ID)',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'uppercase'],
    pattern: '[A-Z0-9*@#]{9}',
    length: { min: 9, max: 9 },
    checksum: { algo: 'cusip' },
    grouping: [3, 3, 3],
    speech: 'char-by-char',
  },
  {
    id: 'isin',
    name: 'ISIN (international security ID)',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'uppercase'],
    pattern: '[A-Z]{2}[A-Z0-9]{9}\\d',
    length: { min: 12, max: 12 },
    checksum: { algo: 'isin' },
    grouping: [2, 9, 1],
    speech: 'char-by-char',
  },
  {
    id: 'btc-address',
    name: 'Bitcoin address',
    builtin: true,
    normalize: ['trim'],
    checksum: null,
    mathCheck: true,
    speech: 'char-by-char',
    extraCheck: (v) => bitcoinAddressCheck(v),
  },
  {
    id: 'eth-address',
    name: 'Ethereum address',
    builtin: true,
    normalize: ['trim'],
    checksum: null,
    mathCheck: true,
    speech: 'char-by-char',
    grouping: [6, 4],
    extraCheck: (v) => ethereumAddressCheck(v),
  },
  {
    id: 'vin',
    name: 'VIN (vehicle ID)',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'uppercase'],
    pattern: '[A-HJ-NPR-Z0-9]{17}',
    length: { min: 17, max: 17 },
    checksum: { algo: 'vin' },
    grouping: [3, 6, 8],
    speech: 'char-by-char',
  },
  {
    id: 'ip-address',
    name: 'IP address (v4 or v6)',
    builtin: true,
    normalize: ['trim', 'strip-spaces'],
    checksum: null,
    speech: 'natural',
    extraCheck: (v) => {
      const result = v.includes(':') ? ipv6Check(v) : ipv4Check(v)
      if (result.errors.length === 0) {
        result.warnings.push('IP addresses have no checksum — double entry is the real check')
      }
      return result
    },
  },
  {
    id: 'phone-e164',
    name: 'Phone number',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'strip-dashes', 'strip-dots', 'strip-parens'],
    pattern: '\\+?[1-9]\\d{6,14}',
    checksum: null,
    grouping: [3, 3, 4],
    speech: 'char-by-char',
  },
  {
    id: 'email',
    name: 'Email address',
    builtin: true,
    normalize: ['trim'],
    pattern: "[^\\s@]+@[^\\s@.]+(?:\\.[^\\s@.]+)+",
    checksum: null,
    speech: 'natural',
  },
  dateValidator('date-mdy', 'Date (MM/DD/YYYY)', 'mdy', '\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}'),
  dateValidator('date-dmy', 'Date (DD/MM/YYYY)', 'dmy', '\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}'),
  dateValidator('date-iso', 'Date (YYYY-MM-DD)', 'ymd', '\\d{4}[/.-]\\d{1,2}[/.-]\\d{1,2}'),
  {
    id: 'generic-number',
    name: 'Number (any)',
    builtin: true,
    normalize: ['trim', 'strip-spaces', 'strip-dashes'],
    pattern: '\\d+',
    checksum: null,
    grouping: [4],
    speech: 'char-by-char',
  },
  {
    id: 'generic-text',
    name: 'Text (exact match)',
    builtin: true,
    normalize: ['trim'],
    checksum: null,
    speech: 'natural',
  },
]

export const builtinById = new Map(BUILTIN_VALIDATORS.map((v) => [v.id, v]))
