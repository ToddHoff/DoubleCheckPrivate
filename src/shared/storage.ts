import { computeSeal, verifyChain, type IntegrityReport } from './seal'
import type { LogEntry, Settings, Stats, TrustedAccount, UserValidatorSpec } from './types'
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

// ---- per-field "require two signatures" flags (keyed like site memory) ----

export async function getDualSignFields(): Promise<Record<string, true>> {
  return get<Record<string, true>>(STORAGE_KEYS.dualSignFields, {})
}

export async function setDualSignField(origin: string, fieldSignature: string, required: boolean): Promise<void> {
  const map = await getDualSignFields()
  const key = siteMemoryKey(origin, fieldSignature)
  if (required) map[key] = true
  else delete map[key]
  await chrome.storage.local.set({ [STORAGE_KEYS.dualSignFields]: map })
}

// ---- audit log ----

const LOG_CAP = 5000

export async function appendLogEntry(entry: LogEntry): Promise<void> {
  const log = await get<LogEntry[]>(STORAGE_KEYS.log, [])
  // chain the seal to the prior entry before writing — every entry is sealed
  const prev = log.length ? log[log.length - 1] : null
  entry.prevSeal = prev?.seal ?? null
  entry.seal = await computeSeal(entry, hmacHex)
  log.push(entry)
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP)
  await chrome.storage.local.set({ [STORAGE_KEYS.log]: log })
}

/** recompute the seal chain and report whether the log is intact */
export async function verifyLogIntegrity(): Promise<IntegrityReport> {
  return verifyChain(await getLog(), hmacHex)
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

// Why: catch categories were added after launch. Spread these defaults over the
// stored object so pre-existing installs read the new keys back as 0, not NaN.
function emptyStats(): Stats {
  return {
    checked: 0,
    mismatchesCaught: 0,
    badValuesCaught: 0,
    accountChangeWarnings: 0,
    pageProblemsFound: 0,
  }
}

async function readStats(): Promise<Stats> {
  return { ...emptyStats(), ...(await get<Stats>(STORAGE_KEYS.stats, emptyStats())) }
}

export async function bumpStats(mismatchCaught: boolean): Promise<void> {
  const stats = await readStats()
  stats.checked++
  if (mismatchCaught) stats.mismatchesCaught++
  await chrome.storage.local.set({ [STORAGE_KEYS.stats]: stats })
}

/** the catch categories the "what Double Check has caught" panel sums */
export type CatchStat = 'badValuesCaught' | 'accountChangeWarnings' | 'pageProblemsFound'

export async function bumpStat(key: CatchStat, by = 1): Promise<void> {
  if (by <= 0) return
  const stats = await readStats()
  stats[key] += by
  await chrome.storage.local.set({ [STORAGE_KEYS.stats]: stats })
}

export async function getStats(): Promise<Stats> {
  return readStats()
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

// keyed HMAC-SHA-256 as lowercase hex — the primitive behind both the value
// fingerprint and the tamper-evident log seal
export async function hmacHex(data: string): Promise<string> {
  const key = await getOrCreateHmacKey()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function fingerprintValue(normalized: string): Promise<string> {
  return hmacHex(normalized)
}

// ---- trusted accounts (payee → value fingerprint; the BEC-fraud catch) ----
// Why only fingerprints: we recognize a previously-saved value without ever
// storing it. A record is written only when the user explicitly saves one.

export async function getTrustedAccounts(): Promise<TrustedAccount[]> {
  return get<TrustedAccount[]>(STORAGE_KEYS.trusted, [])
}

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** save a new trusted account, or bump the one with the same label+format+fingerprint */
export async function saveTrustedAccount(
  rec: { label: string; format: string; fingerprint: string; origin: string },
): Promise<void> {
  const list = await getTrustedAccounts()
  const now = new Date().toISOString()
  const existing = list.find(
    (a) => sameLabel(a.label, rec.label) && a.format === rec.format && a.fingerprint === rec.fingerprint,
  )
  if (existing) {
    existing.useCount++
    existing.lastUsedAt = now
  } else {
    list.push({
      id: crypto.randomUUID(),
      label: rec.label.trim(),
      format: rec.format,
      fingerprint: rec.fingerprint,
      origin: rec.origin,
      createdAt: now,
      lastUsedAt: now,
      useCount: 1,
    })
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.trusted]: list })
}

export async function removeTrustedAccount(id: string): Promise<void> {
  const list = (await getTrustedAccounts()).filter((a) => a.id !== id)
  await chrome.storage.local.set({ [STORAGE_KEYS.trusted]: list })
}

export async function clearTrustedAccounts(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.trusted]: [] })
}
