import { sha256 } from '@noble/hashes/sha256'
import { keccak_256 } from '@noble/hashes/sha3'

// ---- Base58Check (legacy Bitcoin addresses: 1..., 3...) ----

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Decode(s: string): Uint8Array | null {
  const bytes: number[] = [0]
  for (const ch of s) {
    const v = B58.indexOf(ch)
    if (v < 0) return null
    let carry = v
    for (let i = 0; i < bytes.length; i++) {
      const x = bytes[i] * 58 + carry
      bytes[i] = x & 0xff
      carry = x >> 8
    }
    while (carry) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  // leading '1's are leading zero bytes
  for (const ch of s) {
    if (ch !== '1') break
    bytes.push(0)
  }
  return Uint8Array.from(bytes.reverse())
}

export function base58CheckValid(s: string): boolean {
  if (s.length < 26 || s.length > 35) return false
  const data = base58Decode(s)
  if (!data || data.length < 5) return false
  const payload = data.slice(0, -4)
  const checksum = data.slice(-4)
  const hash = sha256(sha256(payload))
  return checksum.every((b, i) => b === hash[i])
}

// ---- Bech32 / Bech32m (segwit: bc1q..., taproot: bc1p...) ----

const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

function bech32Polymod(values: number[]): number {
  let chk = 1
  for (const v of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i]
  }
  return chk
}

function hrpExpand(hrp: string): number[] {
  const out = [...hrp].map((c) => c.charCodeAt(0) >> 5)
  out.push(0)
  for (const c of hrp) out.push(c.charCodeAt(0) & 31)
  return out
}

export function bech32Valid(s: string): boolean {
  const lower = s.toLowerCase()
  if (s !== lower && s !== s.toUpperCase()) return false // mixed case forbidden
  const pos = lower.lastIndexOf('1')
  if (pos < 1 || pos + 7 > lower.length || lower.length > 90) return false
  const hrp = lower.slice(0, pos)
  const data: number[] = []
  for (const ch of lower.slice(pos + 1)) {
    const v = BECH32.indexOf(ch)
    if (v < 0) return false
    data.push(v)
  }
  const polymod = bech32Polymod([...hrpExpand(hrp), ...data])
  // witness v0 → bech32 (const 1); v1+ (taproot) → bech32m (const 0x2bc830a3)
  if (data[0] === 0) return polymod === 1
  return polymod === 0x2bc830a3
}

export function bitcoinAddressCheck(value: string): string[] {
  if (/^(bc1|tb1)/i.test(value)) {
    return bech32Valid(value) ? [] : ['Bech32 checksum failed — at least one character is wrong']
  }
  if (/^[13]/.test(value)) {
    return base58CheckValid(value) ? [] : ['Base58 checksum failed — at least one character is wrong']
  }
  return ['Not a recognized Bitcoin address form (expected 1…, 3…, or bc1…)']
}

// ---- Ethereum EIP-55 ----

export function ethereumAddressCheck(value: string): { errors: string[]; warnings: string[] } {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return { errors: ['Expected 0x followed by 40 hex characters'], warnings: [] }
  }
  const hex = value.slice(2)
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) {
    // no case information → checksum can't be verified, but address is well-formed
    return {
      errors: [],
      warnings: ['Address has no EIP-55 checksum capitalization — a typo cannot be detected mathematically'],
    }
  }
  const hash = keccak_256(new TextEncoder().encode(hex.toLowerCase()))
  for (let i = 0; i < 40; i++) {
    const nibble = (hash[i >> 1] >> (i % 2 === 0 ? 4 : 0)) & 0xf
    const ch = hex[i]
    if (/[a-f]/i.test(ch)) {
      const shouldUpper = nibble >= 8
      if (shouldUpper !== (ch === ch.toUpperCase())) {
        return { errors: ['EIP-55 checksum failed — at least one character is wrong'], warnings: [] }
      }
    }
  }
  return { errors: [], warnings: [] }
}
