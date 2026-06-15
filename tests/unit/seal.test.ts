import { describe, it, expect } from 'vitest'
import { computeSeal, verifyChain, type HmacHex } from '../../src/shared/seal'
import type { LogEntry } from '../../src/shared/types'

// Deterministic fake HMAC — NOT secure, just stable, so the chain logic can be
// tested without WebCrypto or the real per-install key. An attacker without the
// "key" can't reproduce it because it depends on the full canonical string.
const fakeHmac: HmacHex = async (data) => {
  let hsh = 2166136261
  for (let i = 0; i < data.length; i++) {
    hsh ^= data.charCodeAt(i)
    hsh = Math.imul(hsh, 16777619)
  }
  return (hsh >>> 0).toString(16)
}

function entry(id: string, over: Partial<LogEntry> = {}): LogEntry {
  return {
    id,
    at: `2026-01-0${id}T00:00:00.000Z`,
    origin: 'https://bank.example',
    fieldLabel: 'routing number',
    format: 'aba-routing',
    methods: ['double-entry'],
    result: 'match',
    attested: true,
    valueLength: 9,
    durationMs: 1200,
    ...over,
  }
}

// seal a fresh chain the way appendLogEntry does
async function sealed(...entries: LogEntry[]): Promise<LogEntry[]> {
  let prev: string | null = null
  for (const e of entries) {
    e.prevSeal = prev
    e.seal = await computeSeal(e, fakeHmac)
    prev = e.seal
  }
  return entries
}

describe('tamper-evident seal chain', () => {
  it('verifies an intact chain', async () => {
    const log = await sealed(entry('1'), entry('2'), entry('3'))
    const r = await verifyChain(log, fakeHmac)
    expect(r.ok).toBe(true)
    expect(r.sealed).toBe(3)
    expect(r.unsealed).toBe(0)
  })

  it('detects an edited entry', async () => {
    const log = await sealed(entry('1'), entry('2'), entry('3'))
    log[1].valueLength = 99 // tamper after sealing
    const r = await verifyChain(log, fakeHmac)
    expect(r.ok).toBe(false)
    expect(r.broken?.reason).toMatch(/edited/)
  })

  it('detects a deleted middle entry', async () => {
    const log = await sealed(entry('1'), entry('2'), entry('3'))
    log.splice(1, 1) // remove entry 2
    const r = await verifyChain(log, fakeHmac)
    expect(r.ok).toBe(false)
    expect(r.broken?.reason).toMatch(/inserted, removed, or reordered/)
  })

  it('detects reordering', async () => {
    const log = await sealed(entry('1'), entry('2'), entry('3'))
    ;[log[1], log[2]] = [log[2], log[1]]
    const r = await verifyChain(log, fakeHmac)
    expect(r.ok).toBe(false)
  })

  it('detects a forged insertion that lacks a valid seal', async () => {
    const log = await sealed(entry('1'), entry('2'))
    log.splice(1, 0, entry('9', { seal: 'deadbeef', prevSeal: log[0].seal }))
    const r = await verifyChain(log, fakeHmac)
    expect(r.ok).toBe(false)
  })

  it('tolerates a trimmed front (retention / cap dropped older entries)', async () => {
    const log = await sealed(entry('1'), entry('2'), entry('3'))
    log.shift() // first remaining entry now links to an absent predecessor
    const r = await verifyChain(log, fakeHmac)
    expect(r.ok).toBe(true)
  })

  it('stays intact when an entry is later marked stale', async () => {
    const log = await sealed(entry('1'), entry('2'))
    log[0].stale = true // legitimate annotation, excluded from the seal
    const r = await verifyChain(log, fakeHmac)
    expect(r.ok).toBe(true)
  })

  it('seals signatures so a signed entry cannot be quietly altered', async () => {
    const log = await sealed(entry('1', { signatures: ['Ada Lovelace', 'Alan Turing'] }))
    let r = await verifyChain(log, fakeHmac)
    expect(r.ok).toBe(true)
    log[0].signatures = ['Ada Lovelace', 'Someone Else']
    r = await verifyChain(log, fakeHmac)
    expect(r.ok).toBe(false)
  })

  it('reports legacy unsealed entries without flagging tampering', async () => {
    const legacy = entry('1') // no seal (created before sealing existed)
    const log = [legacy, ...(await sealed(entry('2'), entry('3')))]
    const r = await verifyChain(log, fakeHmac)
    expect(r.ok).toBe(true)
    expect(r.unsealed).toBe(1)
    expect(r.sealed).toBe(2)
  })
})
