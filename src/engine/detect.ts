import type { Validator } from './types'
import { validate } from './spec'

export interface FieldSignals {
  name?: string
  id?: string
  label?: string
  placeholder?: string
  autocomplete?: string
  inputmode?: string
  type?: string
  maxLength?: number
  value?: string
}

interface Rule {
  re: RegExp
  formatId: string
  score: number
}

// keyword rules run against name + id + label + placeholder (lowercased)
const KEYWORD_RULES: Rule[] = [
  { re: /\biban\b/, formatId: 'iban', score: 95 },
  { re: /routing|\baba\b|rtn/, formatId: 'aba-routing', score: 90 },
  { re: /swift|\bbic\b/, formatId: 'swift-bic', score: 90 },
  { re: /ssn|social.?sec/, formatId: 'ssn', score: 95 },
  { re: /\bein\b|employer.?id|tax.?id|fein/, formatId: 'ein', score: 80 },
  { re: /sort.?code/, formatId: 'uk-sort-code', score: 90 },
  { re: /clabe/, formatId: 'clabe', score: 95 },
  { re: /cusip/, formatId: 'cusip', score: 95 },
  { re: /isin/, formatId: 'isin', score: 95 },
  { re: /\bvin\b|vehicle.?id/, formatId: 'vin', score: 90 },
  { re: /card.?(number|no|num)|credit.?card|debit.?card|\bpan\b/, formatId: 'card', score: 85 },
  { re: /amount|total|price|payment|\bamt\b|\bsum\b/, formatId: 'currency-amount', score: 75 },
  { re: /bitcoin|\bbtc\b/, formatId: 'btc-address', score: 90 },
  { re: /ethereum|\beth\b|wallet/, formatId: 'eth-address', score: 70 },
  { re: /\bip\b|ip.?(address|addr)|ipv4|ipv6/, formatId: 'ip-address', score: 90 },
  { re: /e.?mail/, formatId: 'email', score: 80 },
  { re: /phone|mobile|\btel\b|\bfax\b/, formatId: 'phone-e164', score: 75 },
  { re: /account.?(number|no|num|#)|beneficiary|acct/, formatId: 'us-bank-account', score: 60 },
  { re: /\bdate\b|\bdob\b/, formatId: 'date-mdy', score: 50 },
]

/**
 * Rank candidate formats for a field. Returns format ids, best first.
 * Per-site memory (handled by the caller) always outranks these signals.
 */
export function suggestFormats(signals: FieldSignals, validators: Validator[]): string[] {
  const scores = new Map<string, number>()
  const bump = (id: string, by: number) => scores.set(id, Math.max(scores.get(id) ?? 0, by))

  const ac = (signals.autocomplete ?? '').toLowerCase()
  if (ac.includes('cc-number')) bump('card', 100)
  if (ac === 'email') bump('email', 90)
  if (ac === 'tel' || ac.startsWith('tel-')) bump('phone-e164', 85)

  if (signals.type === 'email') bump('email', 90)
  if (signals.type === 'tel') bump('phone-e164', 80)

  const text = [signals.name, signals.id, signals.label, signals.placeholder]
    .filter(Boolean).join(' ').toLowerCase()
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(text)) bump(rule.formatId, rule.score)
  }

  // value-shape evidence: a passing checksum is strong, mere shape is weak
  const value = signals.value?.trim()
  if (value) {
    for (const v of validators) {
      if (v.id.startsWith('generic-')) continue
      const r = validate(v, value)
      if (r.checksumPassed) bump(v.id, (scores.get(v.id) ?? 0) + 60)
      else if (r.valid && !v.id.startsWith('date-')) bump(v.id, (scores.get(v.id) ?? 0) + 15)
    }
  }

  return [...scores.entries()]
    .filter(([, s]) => s >= 50)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
}
