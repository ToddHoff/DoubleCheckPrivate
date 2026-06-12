import type { ValidatorSpec } from '../engine/types'

export interface Settings {
  /** read-aloud via local speechSynthesis voices; off by default (open-plan offices) */
  ttsEnabled: boolean
  /** audit-log retention; 0 = keep forever */
  logRetentionDays: number
  /** origins where Submit Guard blocks submission until fields are verified */
  submitGuardOrigins: string[]
  /** store a salted HMAC fingerprint of verified values in the log (off: metadata only) */
  hmacFingerprint: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  ttsEnabled: false,
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
}

export interface Stats {
  checked: number
  mismatchesCaught: number
}

export const STORAGE_KEYS = {
  settings: 'dc:settings',
  userValidators: 'dc:userValidators',
  siteMemory: 'dc:siteMemory',
  log: 'dc:log',
  stats: 'dc:stats',
  hmacKey: 'dc:hmacKey',
  license: 'dc:license',
} as const

/** runtime messages — NOTE: no message type ever carries a field value */
export type RuntimeMessage =
  | { kind: 'dc-activate' }
  | { kind: 'dc-activate-from-popup'; tabId: number }
  | { kind: 'dc-open-options'; section?: string }
  | { kind: 'dc-license-status' }
  | { kind: 'dc-open-payment'; plan?: string }
  | { kind: 'dc-ocr'; imageDataUrl: string } // image bytes only, discarded after OCR
  | { kind: 'dc-capture-visible-tab' }

export interface LicenseStatus {
  active: boolean
  trial: boolean
  /** days remaining on trial; -1 when not on trial */
  trialDaysLeft: number
  /** true when status came from the offline grace cache */
  cached: boolean
}

export type UserValidatorSpec = ValidatorSpec
