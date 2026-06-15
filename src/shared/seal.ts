// Tamper-evident log seal — a keyed HMAC over each entry, chained to the one
// before it. Pure so the chain logic can be unit-tested with a fake HMAC; the
// real keyed HMAC is injected by storage.ts (a per-install random key that
// never leaves the device).
//
// What it proves: the log hasn't been edited, reordered, or had entries
// inserted/removed since it was written ON THIS DEVICE. What it does NOT prove:
// that the values are correct, the signers' identities, or anything against the
// device owner (who holds the key). See docs — we say exactly this in the UI.
import type { LogEntry } from './types'

export type HmacHex = (data: string) => Promise<string>

export interface IntegrityReport {
  ok: boolean
  total: number
  sealed: number
  unsealed: number
  broken: { at: string; reason: string } | null
}

// Why: a stable, field-ordered serialization the seal is computed over. `seal`
// is excluded (it IS the output); `stale` is excluded on purpose — staleness is
// a later, legitimate annotation the extension makes when the field value
// changes, not tampering, so flipping it must not break the seal. `prevSeal` IS
// included, so reordering/removal breaks the chain even when content is intact.
export function canonicalEntry(e: LogEntry): string {
  return JSON.stringify([
    e.id, e.at, e.origin, e.fieldLabel, e.format, e.methods,
    e.result, e.attested, e.valueLength, e.durationMs,
    e.fingerprint ?? null, e.signatures ?? null, e.prevSeal ?? null,
  ])
}

/** seal an entry that already carries its prevSeal link */
export async function computeSeal(e: LogEntry, hmac: HmacHex): Promise<string> {
  return hmac(canonicalEntry(e))
}

export async function verifyChain(log: LogEntry[], hmac: HmacHex): Promise<IntegrityReport> {
  let sealed = 0
  let unsealed = 0
  let broken: { at: string; reason: string } | null = null
  let prevSeal: string | null = null
  // anchored once we've seen a sealed entry whose successor's link we can check.
  // resets across unsealed (legacy) entries and stays false for the first sealed
  // entry, so a trimmed front (retention/cap dropped older entries) isn't flagged.
  let chained = false
  for (const e of log) {
    if (!e.seal) {
      unsealed++
      chained = false
      prevSeal = null
      continue
    }
    sealed++
    const expected = await computeSeal(e, hmac)
    if (expected !== e.seal) {
      broken ??= { at: e.at, reason: 'an entry was edited' }
    } else if (chained && e.prevSeal !== prevSeal) {
      broken ??= { at: e.at, reason: 'an entry was inserted, removed, or reordered' }
    }
    prevSeal = e.seal
    chained = true
  }
  return { ok: broken === null, total: log.length, sealed, unsealed, broken }
}
