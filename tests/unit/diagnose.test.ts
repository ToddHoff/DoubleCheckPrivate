import { describe, expect, it } from 'vitest'
import { diagnose } from '../../src/engine'

describe('diagnose', () => {
  it('match', () => {
    expect(diagnose('021000021', '021000021').kind).toBe('match')
  })

  it('adjacent transposition is called out by name and position', () => {
    const d = diagnose('123456789', '124356789') // 3 and 4 swapped (positions 3,4)
    expect(d.kind).toBe('transposition')
    expect(d.message).toMatch(/3 and 4/)
    expect(d.message).toMatch(/34.*43|“34” vs “43”/)
  })

  it('single substitution names the position and both characters', () => {
    const d = diagnose('123456789', '123856789')
    expect(d.kind).toBe('substitution')
    expect(d.message).toMatch(/position 4/)
    expect(d.message).toMatch(/4.*8/)
  })

  it('missing character', () => {
    const d = diagnose('123456789', '12356789')
    expect(d.kind).toBe('deletion')
    expect(d.message).toMatch(/missing/)
    expect(d.message).toMatch(/“4”/)
  })

  it('extra character', () => {
    const d = diagnose('123456789', '1234556789')
    expect(d.kind).toBe('insertion')
    expect(d.message).toMatch(/extra/)
  })

  it('multiple differences fall back to a count', () => {
    const d = diagnose('123456789', '199459989')
    expect(d.kind).toBe('multiple')
    expect(d.message).toMatch(/differ/)
  })

  it('non-adjacent swap is not misreported as transposition', () => {
    const d = diagnose('123456789', '153426789') // 2 and 5 swapped, not adjacent
    expect(d.kind).toBe('multiple')
  })

  it('diff ops reconstruct both strings', () => {
    const d = diagnose('12345', '12354')
    const exp = d.diff.filter((o) => o.expected !== undefined).map((o) => o.expected).join('')
    const ent = d.diff.filter((o) => o.entered !== undefined).map((o) => o.entered).join('')
    expect(exp).toBe('12345')
    expect(ent).toBe('12354')
  })
})
