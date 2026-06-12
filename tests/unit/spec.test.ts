import { describe, expect, it } from 'vitest'
import { fromUserSpec, validate } from '../../src/engine'

describe('fromUserSpec (user validators are data, never code)', () => {
  const good = {
    id: 'acme-vendor-id',
    name: 'Acme vendor ID',
    normalize: ['trim', 'uppercase'],
    pattern: 'V\\d{7}',
    length: { min: 8, max: 8 },
    checksum: null,
    grouping: [1, 3, 4],
    speech: 'char-by-char',
  }

  it('builds a working validator from a declarative spec', () => {
    const v = fromUserSpec(good)!
    expect(v).not.toBeNull()
    const r = validate(v, ' v1234567 ')
    expect(r.valid).toBe(true)
    expect(r.normalized).toBe('V1234567')
    expect(r.formatted).toBe('V 123 4567')
    expect(validate(v, 'V123456').valid).toBe(false)
  })

  it('supports the weighted-mod checksum menu', () => {
    const v = fromUserSpec({
      id: 'internal-acct',
      name: 'Internal account',
      normalize: ['trim'],
      pattern: '\\d{9}',
      checksum: { algo: 'weighted-mod', weights: [3, 7, 1], modulus: 10, mode: 'sum-zero' },
    })!
    expect(validate(v, '021000021').checksumPassed).toBe(true)
    expect(validate(v, '021000022').valid).toBe(false)
  })

  it('rejects malformed specs instead of guessing', () => {
    expect(fromUserSpec(null)).toBeNull()
    expect(fromUserSpec({ ...good, id: 'BAD ID!' })).toBeNull()
    expect(fromUserSpec({ ...good, pattern: '([' })).toBeNull()
    expect(fromUserSpec({ ...good, checksum: { algo: 'eval' } })).toBeNull()
    expect(fromUserSpec({ ...good, checksum: { algo: 'weighted-mod', weights: 'x', modulus: 10 } })).toBeNull()
  })

  it('silently drops unknown normalize ops (forward compatibility)', () => {
    const v = fromUserSpec({ ...good, normalize: ['trim', 'exfiltrate', 'uppercase'] })!
    expect(v.normalize).toEqual(['trim', 'uppercase'])
  })
})
