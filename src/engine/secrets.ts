// Detect secrets (API keys, tokens, private keys, seed phrases) in text the
// user is about to send somewhere. Precision-first: every pattern is anchored
// on unambiguous structure (a vendor prefix, a PEM header, the BIP-39 word
// list) — never on bare entropy like "40 hex chars", which false-positives on
// git SHAs and UUIDs. For a tool that can block a submit, one false positive
// costs more trust than ten true catches earn.
//
// Hits carry a kind and a human label ONLY — never the matched text — so a
// hit can be shown, logged, or counted without the secret going anywhere.
import { BIP39_WORDS } from './bip39-words'

export interface SecretHit {
  kind: string
  label: string
}

// vendor-prefixed credentials: the prefix is the context-binding
const PATTERNS: Array<{ kind: string; label: string; re: RegExp }> = [
  { kind: 'aws-access-key', label: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: 'github-token', label: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { kind: 'stripe-key', label: 'Stripe live secret key', re: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/ },
  { kind: 'anthropic-key', label: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { kind: 'openai-key', label: 'OpenAI API key', re: /\bsk-proj-[A-Za-z0-9_-]{20,}/ },
  { kind: 'slack-token', label: 'Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { kind: 'google-api-key', label: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  // a JWT is three base64url segments; the first two are JSON objects, so both
  // start with base64url('{"') = "eyJ" — structural, not entropy-based
  { kind: 'jwt', label: 'signed token (JWT)', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { kind: 'private-key', label: 'private key (PEM)', re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/ },
]

// BIP-39 recovery phrases are 12/15/18/21/24 words, every one from the fixed
// 2048-word list. Common English glue words ("the", "of", "and", "is") are NOT
// in the list, so prose breaks a run almost immediately — requiring 12
// consecutive members makes accidental matches vanishingly rare.
const SEED_MIN_WORDS = 12

function hasSeedPhrase(text: string): boolean {
  let run = 0
  // split on anything that isn't a letter; case-insensitive membership
  for (const token of text.toLowerCase().split(/[^a-z]+/)) {
    if (token && BIP39_WORDS.has(token)) {
      if (++run >= SEED_MIN_WORDS) return true
    } else {
      run = 0
    }
  }
  return false
}

// cap the scanned text so a pathological page can't stall the pass; secrets
// pasted into a composer are near the start of what the user wrote anyway
const SCAN_CAP = 50_000

/** scan text for secrets; returns one hit per kind found, never the text itself */
export function detectSecrets(text: string): SecretHit[] {
  const t = text.length > SCAN_CAP ? text.slice(0, SCAN_CAP) : text
  const hits: SecretHit[] = []
  for (const { kind, label, re } of PATTERNS) {
    if (re.test(t)) hits.push({ kind, label })
  }
  if (hasSeedPhrase(t)) {
    hits.push({ kind: 'seed-phrase', label: 'crypto wallet seed phrase' })
  }
  return hits
}
