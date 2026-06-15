import { describe, expect, it } from 'vitest'
import { BUILTIN_VALIDATORS, highValueCandidate, suggestFormats } from '../../src/engine'

const suggest = (signals: Parameters<typeof suggestFormats>[0]) =>
  suggestFormats(signals, BUILTIN_VALIDATORS)

describe('suggestFormats', () => {
  it('reads autocomplete=cc-number as a card field', () => {
    expect(suggest({ autocomplete: 'cc-number' })[0]).toBe('card')
  })

  it('reads field name keywords', () => {
    expect(suggest({ name: 'routing_number' })[0]).toBe('aba-routing')
    expect(suggest({ label: 'IBAN' })[0]).toBe('iban')
    expect(suggest({ id: 'beneficiary-account-no' })[0]).toBe('us-bank-account')
    expect(suggest({ label: 'Wire amount' })[0]).toBe('currency-amount')
    expect(suggest({ name: 'server_ip_address' })[0]).toBe('ip-address')
  })

  it('“payment_date” is a date, not a currency amount (weak “payment” signal)', () => {
    expect(suggest({ name: 'payment_date', id: 'date', label: 'Date' })[0]).toBe('date-mdy')
    // but real amount fields, even when labelled "Payment amount", still win
    expect(suggest({ label: 'Payment amount' })[0]).toBe('currency-amount')
    expect(suggest({ name: 'total_amount' })[0]).toBe('currency-amount')
  })

  it('a passing checksum in the value outranks weak keyword evidence', () => {
    // field is vaguely named "account" but holds a valid routing number
    const ids = suggest({ name: 'account', value: '021000021' })
    expect(ids[0]).toBe('aba-routing')
  })

  it('returns empty for fields with no signals', () => {
    expect(suggest({ name: 'q' })).toEqual([])
  })

  it('never suggests generic formats from value shape alone', () => {
    const ids = suggest({ value: 'hello world' })
    expect(ids).not.toContain('generic-text')
  })
})

describe('highValueCandidate (page-scan tagging)', () => {
  const candidate = (signals: Parameters<typeof highValueCandidate>[0]) =>
    highValueCandidate(signals, BUILTIN_VALIDATORS)

  it('flags money and identity fields', () => {
    expect(candidate({ name: 'routing_number' })?.id).toBe('aba-routing')
    expect(candidate({ label: 'IBAN' })?.id).toBe('iban')
    expect(candidate({ label: 'SSN' })?.id).toBe('ssn')
    expect(candidate({ autocomplete: 'cc-number' })?.id).toBe('card')
    expect(candidate({ id: 'beneficiary-account-number' })?.id).toBe('us-bank-account')
    expect(candidate({ label: 'Wire amount' })?.id).toBe('currency-amount')
  })

  it('does NOT flag low-stakes or weak fields (no noise)', () => {
    expect(candidate({ label: 'Email' })).toBeNull()
    expect(candidate({ name: 'phone' })).toBeNull()
    expect(candidate({ name: 'payment_date', id: 'date', label: 'Date' })).toBeNull()
    expect(candidate({ name: 'comments' })).toBeNull()
    expect(candidate({ name: 'payment_method' })).toBeNull() // weak "payment" only (55 < 60)
  })
})
