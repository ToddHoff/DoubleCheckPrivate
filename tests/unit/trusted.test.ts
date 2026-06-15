import { describe, expect, it } from 'vitest'
import { classifyPayee, recognize } from '../../src/engine'
import type { TrustedRecordLite } from '../../src/engine'

const acme: TrustedRecordLite = { label: 'Acme', format: 'aba-routing', fingerprint: 'fp-acme' }
const acmeAlt: TrustedRecordLite = { label: 'acme', format: 'aba-routing', fingerprint: 'fp-acme-2' }
const globex: TrustedRecordLite = { label: 'Globex', format: 'iban', fingerprint: 'fp-globex' }
const accounts = [acme, acmeAlt, globex]

describe('recognize', () => {
  it('finds a saved account by fingerprint regardless of payee', () => {
    expect(recognize('fp-globex', accounts)?.label).toBe('Globex')
  })
  it('returns null for an unknown fingerprint', () => {
    expect(recognize('fp-unknown', accounts)).toBeNull()
  })
})

describe('classifyPayee', () => {
  it('null when no payee named (feature inert)', () => {
    expect(classifyPayee('fp-acme', accounts, '  ', 'aba-routing')).toBeNull()
  })
  it('match when the value equals a saved account for the payee', () => {
    expect(classifyPayee('fp-acme', accounts, 'Acme', 'aba-routing')).toEqual({ verdict: 'match', savedCount: 2 })
  })
  it('matches case-insensitively on the payee label', () => {
    expect(classifyPayee('fp-acme-2', accounts, 'ACME', 'aba-routing')?.verdict).toBe('match')
  })
  it('changed (the BEC catch) when the payee has saved accounts but none match', () => {
    const v = classifyPayee('fp-fraudster', accounts, 'Acme', 'aba-routing')
    expect(v).toEqual({ verdict: 'changed', savedCount: 2 })
  })
  it('new when the payee has nothing saved for this format', () => {
    expect(classifyPayee('fp-x', accounts, 'NewVendor', 'aba-routing')).toEqual({ verdict: 'new', savedCount: 0 })
  })
  it('does not cross formats — same label, different format counts as new', () => {
    // "Acme" is saved only for aba-routing; verifying an IBAN for Acme is new
    expect(classifyPayee('fp-acme', accounts, 'Acme', 'iban')).toEqual({ verdict: 'new', savedCount: 0 })
  })
})
