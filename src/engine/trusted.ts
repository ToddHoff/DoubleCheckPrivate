// Pure decision logic for trusted-payee matching. The card and storage handle
// fingerprints and DOM; this just classifies, so it's unit-testable.

export interface TrustedRecordLite {
  label: string
  format: string
  fingerprint: string
}

export type PayeeVerdict = 'match' | 'changed' | 'new'

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** does this fingerprint match any saved account (regardless of payee)? */
export function recognize<T extends { fingerprint: string }>(fingerprint: string, accounts: T[]): T | null {
  return accounts.find((a) => a.fingerprint === fingerprint) ?? null
}

/**
 * Classify the current value against a named payee:
 *  - 'match'   — the value equals an account saved for this payee
 *  - 'changed' — the payee has saved account(s) but none match → the BEC catch
 *  - 'new'     — no saved account for this payee yet
 * Returns null when no payee was named (feature inert).
 */
export function classifyPayee(
  fingerprint: string,
  accounts: TrustedRecordLite[],
  label: string,
  format: string,
): { verdict: PayeeVerdict; savedCount: number } | null {
  if (!label.trim()) return null
  const forLabel = accounts.filter((a) => sameLabel(a.label, label) && a.format === format)
  if (forLabel.some((a) => a.fingerprint === fingerprint)) return { verdict: 'match', savedCount: forLabel.length }
  if (forLabel.length) return { verdict: 'changed', savedCount: forLabel.length }
  return { verdict: 'new', savedCount: 0 }
}
