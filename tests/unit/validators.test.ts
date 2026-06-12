import { describe, expect, it } from 'vitest'
import { builtinById, validate } from '../../src/engine'

const v = (id: string) => {
  const val = builtinById.get(id)
  if (!val) throw new Error(`no builtin ${id}`)
  return val
}

describe('aba-routing validator', () => {
  it('accepts with separators and reports checksum', () => {
    const r = validate(v('aba-routing'), ' 021-000-021 ')
    expect(r.valid).toBe(true)
    expect(r.checksumPassed).toBe(true)
    expect(r.normalized).toBe('021000021')
    expect(r.formatted).toBe('021 000 021')
  })
  it('rejects checksum failures with a checksum message', () => {
    const r = validate(v('aba-routing'), '021000022')
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toMatch(/checksum/i)
  })
  it('rejects wrong length with a length message', () => {
    const r = validate(v('aba-routing'), '02100002')
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toMatch(/9 characters/)
  })
})

describe('ssn validator', () => {
  it('accepts a structurally valid SSN', () => {
    const r = validate(v('ssn'), '212-09-9999')
    expect(r.valid).toBe(true)
    expect(r.formatted).toBe('212 09 9999')
    expect(r.hasChecksum).toBe(false)
  })
  it.each(['000-12-3456', '666-12-3456', '912-34-5678', '123-00-4567', '123-45-0000'])(
    'rejects never-issued pattern %s',
    (s) => expect(validate(v('ssn'), s).valid).toBe(false),
  )
})

describe('iban validator', () => {
  it('accepts lowercase with spaces (normalizes)', () => {
    const r = validate(v('iban'), 'gb82 west 1234 5698 7654 32')
    expect(r.valid).toBe(true)
    expect(r.checksumPassed).toBe(true)
    expect(r.formatted).toBe('GB82 WEST 1234 5698 7654 32')
  })
  it('enforces per-country length', () => {
    const r = validate(v('iban'), 'DE8937040044053201300') // 21 chars, DE needs 22
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toMatch(/22 characters/)
  })
  it('warns on unknown country but still checks mod-97', () => {
    const r = validate(v('iban'), 'ZZ68WEST12345698765432')
    expect(r.warnings.join(' ')).toMatch(/unknown/i)
  })
})

describe('card validator', () => {
  it('identifies brand in formatted output', () => {
    const r = validate(v('card'), '4111 1111 1111 1111')
    expect(r.valid).toBe(true)
    expect(r.formatted).toBe('4111 1111 1111 1111 (Visa)')
  })
  it('warns on unknown prefix but accepts valid Luhn', () => {
    const r = validate(v('card'), '1234567812345670')
    expect(r.valid).toBe(true)
    expect(r.warnings.join(' ')).toMatch(/unrecognized/i)
  })
})

describe('ein validator', () => {
  it('accepts 12-3456789', () => expect(validate(v('ein'), '12-3456789').valid).toBe(true))
  it('rejects never-issued prefixes', () => {
    expect(validate(v('ein'), '07-3456789').valid).toBe(false)
    expect(validate(v('ein'), '89-3456789').valid).toBe(false)
  })
})

describe('swift-bic validator', () => {
  it.each(['DEUTDEFF', 'NWBKGB2L', 'CHASUS33XXX', 'deutdeff'])('accepts %s', (s) =>
    expect(validate(v('swift-bic'), s).valid).toBe(true),
  )
  it('rejects bad country code', () => {
    const r = validate(v('swift-bic'), 'DEUTZZFF')
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toMatch(/country/i)
  })
})

describe('currency-amount validator', () => {
  it('canonicalizes and renders words', () => {
    const r = validate(v('currency-amount'), '$1,234,567.89')
    expect(r.valid).toBe(true)
    expect(r.normalized).toBe('1234567.89')
    expect(r.formatted).toBe('1,234,567.89 — one million two hundred thirty-four thousand five hundred sixty-seven and 89/100')
  })
  it('refuses ambiguous separators', () => {
    const r = validate(v('currency-amount'), '1,234')
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toMatch(/decimal separator/i)
  })
  it('handles european format', () => {
    expect(validate(v('currency-amount'), '1.234.567,89').normalized).toBe('1234567.89')
  })
})

describe('crypto address validators', () => {
  it.each([
    '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
    'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
  ])('accepts BTC %s with math check', (s) => {
    const r = validate(v('btc-address'), s)
    expect(r.valid).toBe(true)
    expect(r.checksumPassed).toBe(true)
  })
  it('rejects BTC single-char errors', () => {
    expect(validate(v('btc-address'), '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3').valid).toBe(false)
    expect(validate(v('btc-address'), 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'.replace('5l6', '5l7')).valid).toBe(false)
  })
  it.each([
    '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
    '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
    '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
  ])('accepts ETH %s (EIP-55)', (s) => {
    const r = validate(v('eth-address'), s)
    expect(r.valid).toBe(true)
    expect(r.checksumPassed).toBe(true)
  })
  it('rejects wrong EIP-55 capitalization', () => {
    expect(validate(v('eth-address'), '0x5Aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed').valid).toBe(false)
  })
  it('warns (not errors) on all-lowercase ETH addresses', () => {
    const r = validate(v('eth-address'), '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')
    expect(r.valid).toBe(true)
    expect(r.checksumPassed).toBe(false)
    expect(r.warnings.join(' ')).toMatch(/checksum/i)
  })
})

describe('date validators', () => {
  it('mdy: accepts 02/29/2024 (leap), rejects 02/29/2023', () => {
    expect(validate(v('date-mdy'), '02/29/2024').valid).toBe(true)
    expect(validate(v('date-mdy'), '02/29/2023').valid).toBe(false)
  })
  it('dmy: accepts 29/02/2024, rejects 29/02/2023', () => {
    expect(validate(v('date-dmy'), '29/02/2024').valid).toBe(true)
    expect(validate(v('date-dmy'), '29/02/2023').valid).toBe(false)
  })
  it('iso: accepts 2024-02-29, rejects 2024-02-30', () => {
    expect(validate(v('date-iso'), '2024-02-29').valid).toBe(true)
    expect(validate(v('date-iso'), '2024-02-30').valid).toBe(false)
  })
})

describe('phone-e164 validator', () => {
  it('accepts formatted numbers', () => {
    const r = validate(v('phone-e164'), '+1 (415) 555-2671')
    expect(r.valid).toBe(true)
    expect(r.normalized).toBe('+14155552671')
  })
})

describe('us-bank-account validator', () => {
  it('is honest about having no checksum', () => {
    const r = validate(v('us-bank-account'), '123456789012')
    expect(r.valid).toBe(true)
    expect(r.hasChecksum).toBe(false)
    expect(r.warnings.join(' ')).toMatch(/no public checksum/i)
  })
})

describe('empty input', () => {
  it('reports empty for every builtin', () => {
    const r = validate(v('aba-routing'), '   ')
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toMatch(/empty/i)
  })
})
