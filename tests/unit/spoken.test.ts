import { describe, expect, it } from 'vitest'
import { builtinById, extractCandidates } from '../../src/engine'
import { normalizeSpoken } from '../../src/engine/spoken'

const aba = builtinById.get('aba-routing')!

describe('normalizeSpoken', () => {
  it('converts digit words to digits', () => {
    expect(normalizeSpoken('zero two one zero zero zero zero two one')).toBe('021000021')
  })
  it('handles "oh" and mixed numerals', () => {
    expect(normalizeSpoken('oh two one, 000, oh two one')).toBe('021000021')
  })
  it('keeps real words as words', () => {
    expect(normalizeSpoken('routing number zero two one')).toBe('routing number 021')
  })
  it('spoken punctuation', () => {
    expect(normalizeSpoken('one two three dash four five')).toBe('123-45')
  })
})

describe('spoken transcript → candidates', () => {
  it('finds a routing number in a spoken transcript', () => {
    const text = normalizeSpoken('zero two one zero zero zero zero two one')
    expect(extractCandidates(text, aba).matches).toEqual(['021000021'])
  })
  it('recognizer digit-run output works as-is', () => {
    const text = normalizeSpoken('021000021')
    expect(extractCandidates(text, aba).matches).toEqual(['021000021'])
  })
  it('a misheard digit fails the checksum and lands in nears', () => {
    const text = normalizeSpoken('zero two one zero zero Zero zero two two')
    const { matches, nears } = extractCandidates(text, aba)
    expect(matches).toEqual([])
    expect(nears).toEqual(['021000022'])
  })
})
