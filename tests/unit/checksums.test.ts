import { describe, expect, it } from 'vitest'
import {
  aba, luhn, mod97Iban, damm, verhoeff, clabe, cusip, isin, vin, weightedMod,
} from '../../src/engine/checksums'
import type { ChecksumRef } from '../../src/engine/types'

type WeightedMod = Extract<ChecksumRef, { algo: 'weighted-mod' }>

// real, published numbers (banks publish routing numbers; test cards are Stripe/issuer test numbers)
const VALID_ABA = ['021000021', '011401533', '091000019', '122105278', '026009593']
const VALID_LUHN = ['4111111111111111', '5555555555554444', '378282246310005', '6011111111111117', '4012888888881881']
const VALID_IBAN = [
  'GB82WEST12345698765432',
  'DE89370400440532013000',
  'FR1420041010050500013M02606',
  'NL91ABNA0417164300',
  'ES9121000418450200051332',
]
const VALID_CUSIP = ['037833100', '17275R102', '68389X105', '594918104']
const VALID_ISIN = ['US0378331005', 'US5949181045', 'GB0002634946']
const VALID_VIN = ['1M8GDM9AXKP042788', '11111111111111111', '5GZCZ43D13S812715']
const VALID_CLABE = ['032180000118359719']

describe('aba', () => {
  it.each(VALID_ABA)('accepts %s', (v) => expect(aba(v)).toBe(true))
  it('rejects single-digit errors', () => {
    expect(aba('021000022')).toBe(false)
    expect(aba('121000021')).toBe(false)
    expect(aba('123456789')).toBe(false)
  })
  it('rejects wrong shape', () => {
    expect(aba('02100002')).toBe(false)
    expect(aba('0210000211')).toBe(false)
    expect(aba('02100002a')).toBe(false)
  })
})

describe('luhn', () => {
  it.each(VALID_LUHN)('accepts %s', (v) => expect(luhn(v)).toBe(true))
  it('rejects single-digit errors', () => {
    expect(luhn('4111111111111112')).toBe(false)
    expect(luhn('5555555555554443')).toBe(false)
  })
})

describe('mod97Iban', () => {
  it.each(VALID_IBAN)('accepts %s', (v) => expect(mod97Iban(v)).toBe(true))
  it('rejects single-digit errors and transpositions', () => {
    expect(mod97Iban('GB82WEST12345698765431')).toBe(false)
    expect(mod97Iban('DE89370400440532013001')).toBe(false)
    expect(mod97Iban('DE89370400440532031000')).toBe(false) // adjacent swap
  })
})

describe('cusip', () => {
  it.each(VALID_CUSIP)('accepts %s', (v) => expect(cusip(v)).toBe(true))
  it('rejects mutations', () => {
    expect(cusip('037833101')).toBe(false)
    expect(cusip('037833010')).toBe(false)
  })
})

describe('isin', () => {
  it.each(VALID_ISIN)('accepts %s', (v) => expect(isin(v)).toBe(true))
  it('rejects mutations', () => {
    expect(isin('US0378331006')).toBe(false)
    expect(isin('US0378313005')).toBe(false)
  })
})

describe('vin', () => {
  it.each(VALID_VIN)('accepts %s', (v) => expect(vin(v)).toBe(true))
  it('rejects mutations and I/O/Q', () => {
    expect(vin('1M8GDM9AXKP042789')).toBe(false)
    expect(vin('1M8GDM9AXKP04278O' as string)).toBe(false)
  })
})

describe('clabe', () => {
  it.each(VALID_CLABE)('accepts %s', (v) => expect(clabe(v)).toBe(true))
  it('rejects mutations', () => {
    expect(clabe('032180000118359718')).toBe(false)
    expect(clabe('032180000118359791')).toBe(false)
  })
})

function checkDigitFor(base: string, fn: (s: string) => boolean): string {
  const hits = '0123456789'.split('').filter((d) => fn(base + d))
  expect(hits).toHaveLength(1) // exactly one valid check digit must exist
  return hits[0]
}

describe('damm and verhoeff (catch ALL single errors and adjacent transpositions)', () => {
  it('matches published vectors', () => {
    expect(damm('5724')).toBe(true) // 572 → check digit 4
    expect(verhoeff('2363')).toBe(true) // 236 → check digit 3
  })

  const bases = ['572', '236', '123456', '904713579', '31415926535']
  for (const [name, fn] of [['damm', damm], ['verhoeff', verhoeff]] as const) {
    it(`${name}: every single substitution and adjacent transposition is caught`, () => {
      for (const base of bases) {
        const full = base + checkDigitFor(base, fn)
        expect(fn(full)).toBe(true)
        for (let i = 0; i < full.length; i++) {
          for (const d of '0123456789') {
            if (d === full[i]) continue
            expect(fn(full.slice(0, i) + d + full.slice(i + 1))).toBe(false)
          }
          if (i < full.length - 1 && full[i] !== full[i + 1]) {
            const swapped = full.slice(0, i) + full[i + 1] + full[i] + full.slice(i + 2)
            expect(fn(swapped)).toBe(false)
          }
        }
      }
    })
  }
})

describe('weighted-mod generic algorithm', () => {
  it('reproduces ABA as weights [3,7,1], sum-zero mod 10', () => {
    const ref: WeightedMod = { algo: 'weighted-mod', weights: [3, 7, 1], modulus: 10, mode: 'sum-zero' }
    for (const v of VALID_ABA) expect(weightedMod(v, ref)).toBe(true)
    expect(weightedMod('021000022', ref)).toBe(false)
  })
  it('reproduces CLABE as weights [3,7,1], mod10 terms, check-digit mod 10', () => {
    const ref: WeightedMod = { algo: 'weighted-mod', weights: [3, 7, 1], modulus: 10, termTransform: 'mod10', mode: 'check-digit' }
    expect(weightedMod('032180000118359719', ref)).toBe(true)
    expect(weightedMod('032180000118359718', ref)).toBe(false)
  })
})

describe('single-digit mutation sweep (every checksummed format)', () => {
  const cases: Array<[string, (s: string) => boolean, string[]]> = [
    ['aba', aba, VALID_ABA],
    ['luhn', luhn, VALID_LUHN],
    ['iban', mod97Iban, VALID_IBAN],
    ['cusip', cusip, VALID_CUSIP],
    ['isin', isin, VALID_ISIN],
    ['vin', vin, VALID_VIN],
    ['clabe', clabe, VALID_CLABE],
  ]
  for (const [name, fn, vectors] of cases) {
    it(`${name}: changing any single digit invalidates the value`, () => {
      for (const v of vectors) {
        for (let i = 0; i < v.length; i++) {
          if (!/\d/.test(v[i])) continue
          for (const d of '0123456789') {
            if (d === v[i]) continue
            expect(fn(v.slice(0, i) + d + v.slice(i + 1)), `${name} ${v} pos ${i}→${d}`).toBe(false)
          }
        }
      }
    })
  }
})
