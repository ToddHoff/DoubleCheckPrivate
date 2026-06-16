import type { ValidatorSpec } from '../engine/types'

export interface Settings {
  /** audit-log retention; 0 = keep forever */
  logRetentionDays: number
  /** origins where Submit Guard blocks submission until fields are verified */
  submitGuardOrigins: string[]
  /** store a salted HMAC fingerprint of verified values in the log (off: metadata only) */
  hmacFingerprint: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  logRetentionDays: 365,
  submitGuardOrigins: [],
  hmacFingerprint: false,
}

export type VerifyResult = 'match' | 'mismatch-resolved'

export interface LogEntry {
  id: string
  at: string // ISO timestamp
  origin: string
  fieldLabel: string
  format: string
  methods: string[]
  result: VerifyResult
  attested: boolean
  valueLength: number
  durationMs: number
  /** value changed in the field after attestation */
  stale?: boolean
  /** HMAC-SHA-256 of the normalized value, only when the user opted in */
  fingerprint?: string
  /** typed names of the two people who signed, when the field requires it */
  signatures?: string[]
  /** optional free-text note about the value (where it came from, how derived) */
  note?: string
  /** tamper-evident seal: keyed HMAC over this entry, chained to the previous */
  seal?: string
  /** the previous entry's seal at write time — the chain link */
  prevSeal?: string | null
}

export interface Stats {
  checked: number
  mismatchesCaught: number
  /** field value failed a checksum/format/hidden-character check */
  badValuesCaught: number
  /** an account didn't match the one saved for that payee (the BEC catch) */
  accountChangeWarnings: number
  /** problems surfaced by a whole-page audit */
  pageProblemsFound: number
}

// A value the user explicitly chose to remember for a payee. Stores a one-way
// HMAC fingerprint, never the value itself. The label is a user-typed name.
export interface TrustedAccount {
  id: string
  label: string
  format: string
  fingerprint: string
  origin: string
  createdAt: string
  lastUsedAt: string
  useCount: number
}

export const STORAGE_KEYS = {
  settings: 'dc:settings',
  userValidators: 'dc:userValidators',
  siteMemory: 'dc:siteMemory',
  dualSignFields: 'dc:dualSignFields',
  log: 'dc:log',
  stats: 'dc:stats',
  hmacKey: 'dc:hmacKey',
  license: 'dc:license',
  devLicense: 'dc:devLicense',
  trusted: 'dc:trusted',
} as const

/**
 * runtime messages — NOTE: no message ever leaves the extension's own
 * contexts, and none carries a verified value. dc-ocr carries image bytes,
 * discarded after local OCR. Voice transcripts never appear here at all:
 * recognition runs inside the content script (see content/voice-rec.ts).
 */
export type RuntimeMessage =
  | { kind: 'dc-activate' }
  | { kind: 'dc-scan-page' }
  | { kind: 'dc-audit-page' }
  | { kind: 'dc-activate-from-popup'; tabId: number }
  | { kind: 'dc-open-options'; section?: string }
  | { kind: 'dc-license-status' }
  | { kind: 'dc-payment-action'; action: string }
  | { kind: 'dc-ocr'; imageDataUrl: string }
  | { kind: 'dc-open-mic-setup' }
  | { kind: 'dc-open-help' }

export interface LicenseStatus {
  active: boolean
  trial: boolean
  /** days remaining on trial; -1 when not on trial */
  trialDaysLeft: number
  /** true when status came from the offline grace cache */
  cached: boolean
}

export type UserValidatorSpec = ValidatorSpec
