import { describe, it, expect } from 'vitest'
import { looksMasked } from '../../src/engine'

describe('looksMasked — sites that replace typed chars with mask glyphs', () => {
  it('flags an SSN rendered as X’s (IRS Direct Pay)', () => {
    expect(looksMasked('XXX-XX-XXXX')).toBe(true)
    expect(looksMasked('xxxxxxxxx')).toBe(true)
  })

  it('flags bullet/asterisk masks', () => {
    expect(looksMasked('•••••••')).toBe(true)
    expect(looksMasked('*********')).toBe(true)
  })

  it('does not flag a real value', () => {
    expect(looksMasked('123-45-6789')).toBe(false)
    expect(looksMasked('021000021')).toBe(false)
    expect(looksMasked('GB82WEST12345698765432')).toBe(false)
  })

  it('does not flag mixed content or short strings', () => {
    expect(looksMasked('X12345')).toBe(false) // a real value that starts with X
    expect(looksMasked('XX')).toBe(false) // too short to be confident
    expect(looksMasked('')).toBe(false)
  })
})
