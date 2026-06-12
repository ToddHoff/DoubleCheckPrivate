import { describe, expect, it } from 'vitest'
import { BUILTIN_VALIDATORS, suggestFormats } from '../../src/engine'

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
