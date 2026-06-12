import { describe, expect, it } from 'vitest'
import { amountToWords, formatAmount, integerToWords, parseAmount } from '../../src/engine'

describe('parseAmount', () => {
  const ok = (raw: string, canonical: string) => {
    const p = parseAmount(raw)
    expect(p, raw).not.toBeNull()
    expect(p!.canonical, raw).toBe(canonical)
  }
  it('parses US format', () => {
    ok('1,234,567.89', '1234567.89')
    ok('$1,234.56', '1234.56')
    ok('1234567.89', '1234567.89')
    ok('1,234.5', '1234.50')
  })
  it('parses European format', () => {
    ok('1.234.567,89', '1234567.89')
    ok('1 234 567,89', '1234567.89')
    ok('12,34', '12.34')
  })
  it('parses plain integers and grouped integers', () => {
    ok('1234', '1234')
    ok('1,234,567', '1234567')
  })
  it('refuses genuinely ambiguous values', () => {
    expect(parseAmount('1,234')).toBeNull()
    expect(parseAmount('1.234')).toBeNull()
  })
  it('refuses malformed values', () => {
    expect(parseAmount('1,23,456.78')).toBeNull()
    expect(parseAmount('12.345.6')).toBeNull()
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
})

describe('words', () => {
  it('integerToWords', () => {
    expect(integerToWords('0')).toBe('zero')
    expect(integerToWords('17')).toBe('seventeen')
    expect(integerToWords('342')).toBe('three hundred forty-two')
    expect(integerToWords('1000000')).toBe('one million')
    expect(integerToWords('1234567')).toBe('one million two hundred thirty-four thousand five hundred sixty-seven')
  })
  it('amountToWords includes explicit cents', () => {
    expect(amountToWords(parseAmount('1,200,000.00')!)).toBe('one million two hundred thousand and 00/100')
    expect(amountToWords(parseAmount('45')!)).toBe('forty-five even')
  })
  it('formatAmount regroups canonically', () => {
    expect(formatAmount(parseAmount('1.234.567,89')!)).toBe('1,234,567.89')
  })
})
