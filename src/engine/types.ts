export type NormalizeOp =
  | 'trim'
  | 'strip-spaces'
  | 'strip-dashes'
  | 'strip-dots'
  | 'strip-parens'
  | 'uppercase'
  | 'lowercase'

export type ChecksumRef =
  | { algo: 'luhn' | 'aba' | 'mod97-iban' | 'damm' | 'verhoeff' | 'clabe' | 'cusip' | 'isin' | 'vin' }
  | {
      algo: 'weighted-mod'
      /** cycled over the digits if shorter than the value */
      weights: number[]
      modulus: number
      /** none: term = d*w; mod10: term = (d*w)%10; digit-sum: term = digitSum(d*w) */
      termTransform?: 'none' | 'mod10' | 'digit-sum'
      /** check-digit: last digit must equal (m - sum%m)%m over preceding digits; sum-zero: whole value sums to 0 mod m */
      mode?: 'check-digit' | 'sum-zero'
      /** weight application direction (default 'left': first weight on first char) */
      direction?: 'left' | 'right'
    }

export interface ValidatorSpec {
  id: string
  name: string
  notes?: string
  normalize: NormalizeOp[]
  /** regex applied to the normalized value (implicitly anchored) */
  pattern?: string
  length?: { min: number; max: number }
  checksum?: ChecksumRef | null
  /** chunk sizes for display/speech, e.g. [3,3,3]; cycles last size if value is longer */
  grouping?: number[]
  speech?: 'char-by-char' | 'natural'
}

/** Built-ins may carry code; user validators are pure declarative specs. */
export interface Validator extends ValidatorSpec {
  builtin?: boolean
  /** parse-based normalization (e.g. amounts); runs after normalize ops */
  canonicalize?: (value: string) => { value?: string; error?: string }
  /** extra structural rules beyond the declarative spec; returns error messages */
  extraCheck?: (normalized: string) => { errors: string[]; warnings?: string[] } | string[]
  /** true when extraCheck constitutes a real mathematical verification (EIP-55 etc.) */
  mathCheck?: boolean
  /** override display formatting (e.g. currency) */
  format?: (normalized: string) => string
}

export interface ValidationResult {
  valid: boolean
  /** normalized value (what comparisons run on) */
  normalized: string
  /** human-friendly grouped rendering for visual compare */
  formatted: string
  errors: string[]
  warnings: string[]
  /** true when a real mathematical check (not just shape) ran and passed */
  checksumPassed: boolean
  /** true when the format has a mathematical check at all */
  hasChecksum: boolean
}
