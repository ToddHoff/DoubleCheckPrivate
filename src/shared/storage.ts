import type { LogEntry, Settings, Stats, UserValidatorSpec } from './types'
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './types'

// All storage is chrome.storage.local. Nothing here ever stores a verified
// value — LogEntry carries metadata (and an opt-in HMAC) only.

async function get<T>(key: string, fallback: T): Promise<T> {
  const obj = await chrome.storage.local.get(key)
  return (obj[key] as T | undefined) ?? fallback
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await get<Partial<Settings>>(STORAGE_KEYS.settings, {})) }
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: s })
}

export async function getUserValidatorSpecs(): Promise<UserValidatorSpec[]> {
  return get<UserValidatorSpec[]>(STORAGE_KEYS.userValidators, [])
}

export async function saveUserValidatorSpecs(specs: UserValidatorSpec[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.userValidators]: specs })
}

// ---- per-site field→format memory ----

export function siteMemoryKey(origin: string, fieldSignature: string): string {
  return `${origin}::${fieldSignature}`
}

export async function getSiteMemory(): Promise<Record<string, string>> {
  return get<Record<string, string>>(STORAGE_KEYS.siteMemory, {})
}

export async function rememberFormat(origin: string, fieldSignature: string, formatId: string): Promise<void> {
  const mem = await getSiteMemory()
  mem[siteMemoryKey(origin, fieldSignature)] = formatId
  // cap: drop oldest half if it somehow grows huge
  const keys = Object.keys(mem)
  if (keys.length > 2000) for (const k of keys.slice(0, 1000)) delete mem[k]
  await chrome.storage.local.set({ [STORAGE_KEYS.siteMemory]: mem })
}

// ---- audit log ----

const LOG_CAP = 5000

export async function appendLogEntry(entry: LogEntry): Promise<void> {
  const log = await get<LogEntry[]>(STORAGE_KEYS.log, [])
  log.push(entry)
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP)
  await chrome.storage.local.set({ [STORAGE_KEYS.log]: log })
}

export async function getLog(): Promise<LogEntry[]> {
  return get<LogEntry[]>(STORAGE_KEYS.log, [])
}

export async function markLogEntryStale(id: string): Promise<void> {
  const log = await get<LogEntry[]>(STORAGE_KEYS.log, [])
  const entry = log.find((e) => e.id === id)
  if (entry) {
    entry.stale = true
    await chrome.storage.local.set({ [STORAGE_KEYS.log]: log })
  }
}

export async function purgeLog(retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0
  const log = await get<LogEntry[]>(STORAGE_KEYS.log, [])
  const cutoff = Date.now() - retentionDays * 86_400_000
  const kept = log.filter((e) => Date.parse(e.at) >= cutoff)
  const purged = log.length - kept.length
  if (purged > 0) await chrome.storage.local.set({ [STORAGE_KEYS.log]: kept })
  return purged
}

export async function clearLog(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.log]: [] })
}

// ---- local-only stats (the "412 values double-checked" counter) ----

export async function bumpStats(mismatchCaught: boolean): Promise<void> {
  const stats = await get<Stats>(STORAGE_KEYS.stats, { checked: 0, mismatchesCaught: 0 })
  stats.checked++
  if (mismatchCaught) stats.mismatchesCaught++
  await chrome.storage.local.set({ [STORAGE_KEYS.stats]: stats })
}

export async function getStats(): Promise<Stats> {
  return get<Stats>(STORAGE_KEYS.stats, { checked: 0, mismatchesCaught: 0 })
}

// ---- read-aloud speed (sticky, controlled from the card) ----

export const TTS_RATES = [
  { rate: 1.0, label: '1×' },
  { rate: 0.75, label: '¾×' },
  { rate: 0.5, label: '½×' },
] as const

export async function getTtsRate(): Promise<number> {
  const stored = await get<number>('dc:ttsRate', 0.75)
  return TTS_RATES.some((r) => r.rate === stored) ? stored : 0.75
}

export async function saveTtsRate(rate: number): Promise<void> {
  await chrome.storage.local.set({ 'dc:ttsRate': rate })
}

// ---- terms acceptance (click-wrap) ----
// Why affirmative acceptance: "continued use constitutes acceptance" is the
// weakest form of assent; an "I agree" click recorded with version + time
// is what makes the ToS (and its liability shields) actually enforceable.
export const TOS_VERSION = '2026-06'

export async function getTosAcceptance(): Promise<{ version: string; at: string } | null> {
  return get<{ version: string; at: string } | null>('dc:tosAccepted', null)
}

export async function saveTosAcceptance(): Promise<void> {
  await chrome.storage.local.set({
    'dc:tosAccepted': { version: TOS_VERSION, at: new Date().toISOString() },
  })
}

// ---- opt-in HMAC fingerprint ----

// Why: lets a user later prove "the value I verified equals the one on this
// statement" without storing the value. Off by default: a 9-digit space is
// brute-forceable if BOTH the log and this key are exfiltrated together.
export async function getOrCreateHmacKey(): Promise<CryptoKey> {
  const stored = await get<number[] | null>(STORAGE_KEYS.hmacKey, null)
  let raw: Uint8Array
  if (stored) {
    raw = new Uint8Array(stored)
  } else {
    raw = crypto.getRandomValues(new Uint8Array(32))
    await chrome.storage.local.set({ [STORAGE_KEYS.hmacKey]: [...raw] })
  }
  return crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

export async function fingerprintValue(normalized: string): Promise<string> {
  const key = await getOrCreateHmacKey()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(normalized))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
