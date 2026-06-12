import { describe, expect, it } from 'vitest'
import { builtinById, extractCandidates } from '../../src/engine'

const v = (id: string) => builtinById.get(id)!

describe('extractCandidates (OCR text → format candidates)', () => {
  it('finds a routing number embedded in noisy OCR text', () => {
    const text = 'ACME BANK\nWire instructions\nRouting: 021000021\nAccount: 8839021'
    const { matches } = extractCandidates(text, v('aba-routing'))
    expect(matches).toEqual(['021000021'])
  })

  it('repairs common digit confusions (O→0, l→1) when the checksum then passes', () => {
    const text = 'Routing number O2100002l' // OCR read 0 as O and 1 as l
    const { matches } = extractCandidates(text, v('aba-routing'))
    expect(matches).toEqual(['021000021'])
  })

  it('reports near-misses separately and never as matches', () => {
    const text = 'Routing: 021000022' // checksum fails
    const { matches, nears } = extractCandidates(text, v('aba-routing'))
    expect(matches).toEqual([])
    expect(nears).toEqual(['021000022'])
  })

  it('finds an IBAN split across spacing', () => {
    const text = 'IBAN\nGB82 WEST 1234 5698 7654 32\nBIC NWBKGB2L'
    const { matches } = extractCandidates(text, v('iban'))
    expect(matches).toEqual(['GB82WEST12345698765432'])
  })

  it('returns multiple valid candidates when the image holds several', () => {
    const text = 'From acct routing 021000021 to routing 026009593'
    const { matches } = extractCandidates(text, v('aba-routing'))
    expect(matches.sort()).toEqual(['021000021', '026009593'])
  })

  it('finds amounts', () => {
    const text = 'TOTAL DUE: $1,234,567.89\nthank you'
    const { matches } = extractCandidates(text, v('currency-amount'))
    expect(matches).toContain('1234567.89')
  })

  it('digit-format nears are digits, never word mash', () => {
    // a spoken transcript line plus its digit conversion (the voice path)
    const text = 'One two three\n123'
    const { matches, nears } = extractCandidates(text, v('us-bank-account'))
    expect(matches).toEqual([]) // 123 is too short for an account number
    expect(nears).toContain('123') // shown so the length error can explain
    expect(nears.join(' ')).not.toMatch(/onetwothree/i)
  })
})
