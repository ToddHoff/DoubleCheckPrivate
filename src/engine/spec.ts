import type { ValidationResult, Validator, ValidatorSpec } from './types'
import { applyNormalize, groupValue } from './normalize'
import { runChecksum } from './checksums'

export function validate(v: Validator, raw: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  let normalized = applyNormalize(raw, v.normalize)
  const hasChecksum = !!v.checksum || !!v.mathCheck
  let checksumPassed = false

  if (v.canonicalize && normalized.length > 0) {
    const c = v.canonicalize(normalized)
    if (c.error) errors.push(c.error)
    else if (c.value !== undefined) normalized = c.value
  }

  if (normalized.length === 0) {
    errors.push('Value is empty')
  } else if (errors.length === 0) {
    if (v.length && (normalized.length < v.length.min || normalized.length > v.length.max)) {
      errors.push(
        v.length.min === v.length.max
          ? `Expected exactly ${v.length.min} characters, got ${normalized.length}`
          : `Expected ${v.length.min}–${v.length.max} characters, got ${normalized.length}`,
      )
    }
    if (v.pattern && !new RegExp(`^(?:${v.pattern})$`).test(normalized)) {
      errors.push(`Doesn’t match the ${v.name} format`)
    }
    if (errors.length === 0) {
      if (v.checksum) {
        if (runChecksum(normalized, v.checksum)) {
          checksumPassed = true
        } else {
          errors.push('Checksum failed — at least one character is wrong')
        }
      }
      if (v.extraCheck) {
        const res = v.extraCheck(normalized)
        const extraErrors = Array.isArray(res) ? res : res.errors
        const extraWarnings = Array.isArray(res) ? [] : (res.warnings ?? [])
        errors.push(...extraErrors)
        warnings.push(...extraWarnings)
        if (v.mathCheck && extraErrors.length === 0 && extraWarnings.length === 0) checksumPassed = true
      }
    }
  }

  const valid = errors.length === 0
  return {
    valid,
    normalized,
    formatted: valid && v.format ? v.format(normalized) : groupValue(normalized, v.grouping),
    errors,
    warnings,
    checksumPassed: valid && checksumPassed,
    hasChecksum,
  }
}

const SAFE_NORMALIZE = new Set([
  'trim', 'strip-spaces', 'strip-dashes', 'strip-dots', 'strip-parens', 'uppercase', 'lowercase',
])

/**
 * Sanitize a user-authored spec loaded from storage into a runnable Validator.
 * Why: user validators are DATA — this function is the wall that keeps them
 * that way. Nothing here may ever eval, Function(), or import anything.
 * Returns null when the spec is malformed rather than guessing.
 */
export function fromUserSpec(spec: unknown): Validator | null {
  if (typeof spec !== 'object' || spec === null) return null
  const s = spec as Partial<ValidatorSpec>
  if (typeof s.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(s.id)) return null
  if (typeof s.name !== 'string' || s.name.length === 0 || s.name.length > 80) return null
  const normalize = Array.isArray(s.normalize)
    ? s.normalize.filter((op): op is ValidatorSpec['normalize'][number] => SAFE_NORMALIZE.has(op as string))
    : []
  let pattern: string | undefined
  if (typeof s.pattern === 'string' && s.pattern.length <= 500) {
    try {
      new RegExp(s.pattern)
      pattern = s.pattern
    } catch {
      return null
    }
  }
  let length: { min: number; max: number } | undefined
  if (s.length && Number.isInteger(s.length.min) && Number.isInteger(s.length.max) &&
      s.length.min >= 1 && s.length.max >= s.length.min && s.length.max <= 1024) {
    length = { min: s.length.min, max: s.length.max }
  }
  let checksum: ValidatorSpec['checksum'] = null
  if (s.checksum && typeof s.checksum === 'object') {
    const c = s.checksum
    if (c.algo === 'weighted-mod') {
      if (Array.isArray(c.weights) && c.weights.length >= 1 && c.weights.length <= 64 &&
          c.weights.every((w) => Number.isInteger(w) && w >= 0 && w <= 1000) &&
          Number.isInteger(c.modulus) && c.modulus >= 2 && c.modulus <= 1000) {
        checksum = {
          algo: 'weighted-mod',
          weights: c.weights,
          modulus: c.modulus,
          termTransform: ['none', 'mod10', 'digit-sum'].includes(c.termTransform as string) ? c.termTransform : 'none',
          mode: c.mode === 'sum-zero' ? 'sum-zero' : 'check-digit',
          direction: c.direction === 'right' ? 'right' : 'left',
        }
      } else return null
    } else if (['luhn', 'aba', 'mod97-iban', 'damm', 'verhoeff', 'clabe', 'cusip', 'isin', 'vin'].includes(c.algo)) {
      checksum = { algo: c.algo }
    } else return null
  }
  const grouping = Array.isArray(s.grouping) && s.grouping.every((g) => Number.isInteger(g) && g >= 1 && g <= 64)
    ? s.grouping.slice(0, 32)
    : undefined
  return {
    id: s.id,
    name: s.name,
    notes: typeof s.notes === 'string' ? s.notes.slice(0, 500) : undefined,
    normalize,
    pattern,
    length,
    checksum,
    grouping,
    speech: s.speech === 'natural' ? 'natural' : 'char-by-char',
  }
}
