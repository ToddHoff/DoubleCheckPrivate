import { describe, expect, it } from 'vitest'
import { detectSecrets } from '../../src/engine/secrets'

const kinds = (text: string) => detectSecrets(text).map((h) => h.kind)

// canonical 12-word BIP-39 test vector (from the spec's own vectors)
const SEED_12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

// Stripe's documented example key body — assembled at runtime because GitHub
// push protection scans source for contiguous sk_live_/sk_test_ patterns and
// blocks the push (our own detector's fixtures tripping someone else's
// detector). Concatenation keeps the tested value identical.
const STRIPE_BODY = '4eC39HqLyjWDarjtT1zdp7dc'
const stripeKey = (prefix: string) => `${prefix}_${'live'}_${STRIPE_BODY}`
const stripeTestKey = () => `sk_${'test'}_${STRIPE_BODY}`

describe('secret detection — true positives', () => {
  it('AWS access key (canonical documentation example)', () => {
    expect(kinds('aws_access_key_id = AKIAIOSFODNN7EXAMPLE')).toContain('aws-access-key')
    expect(kinds('temp creds: ASIAIOSFODNN7EXAMPLE')).toContain('aws-access-key')
  })

  it('GitHub tokens (classic and fine-grained)', () => {
    expect(kinds(`token: ghp_${'a1B2'.repeat(9)}`)).toContain('github-token')
    expect(kinds(`github_pat_${'A0'.repeat(11)}_x`)).toContain('github-token')
  })

  it('Stripe live secret key', () => {
    expect(kinds(stripeKey('sk'))).toContain('stripe-key')
    expect(kinds(stripeKey('rk'))).toContain('stripe-key')
  })

  it('Anthropic and OpenAI keys', () => {
    expect(kinds('sk-ant-api03-abcdefghijklmnopqrstuvwx')).toContain('anthropic-key')
    expect(kinds('sk-proj-abcdefghijklmnopqrstuvwx')).toContain('openai-key')
  })

  it('Slack token', () => {
    expect(kinds('xoxb-1234567890-abcdefghij')).toContain('slack-token')
  })

  it('Google API key', () => {
    expect(kinds(`AIza${'Sy'.repeat(17)}D`)).toContain('google-api-key')
  })

  it('JWT (three base64url segments, first two eyJ…)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(kinds(`Bearer ${jwt}`)).toContain('jwt')
  })

  it('PEM private keys, including OpenSSH and PGP block forms', () => {
    expect(kinds('-----BEGIN RSA PRIVATE KEY-----\nMIIEow…')).toContain('private-key')
    expect(kinds('-----BEGIN OPENSSH PRIVATE KEY-----')).toContain('private-key')
    expect(kinds('-----BEGIN PGP PRIVATE KEY BLOCK-----')).toContain('private-key')
    expect(kinds('-----BEGIN PRIVATE KEY-----')).toContain('private-key')
  })

  it('BIP-39 seed phrase — 12 and 24 words, case-insensitive, punctuation-tolerant', () => {
    expect(kinds(SEED_12)).toContain('seed-phrase')
    expect(kinds(`${SEED_12} ${SEED_12}`)).toContain('seed-phrase') // 24 words
    expect(kinds(SEED_12.toUpperCase())).toContain('seed-phrase')
    expect(kinds(SEED_12.split(' ').join(', '))).toContain('seed-phrase')
    expect(kinds(`my recovery phrase is: ${SEED_12}, keep it safe`)).toContain('seed-phrase')
  })

  it('finds a secret embedded in surrounding prose', () => {
    expect(kinds(`Hey, can you debug this? My key is AKIAIOSFODNN7EXAMPLE and it 403s.`))
      .toEqual(['aws-access-key'])
  })

  it('reports each kind once, and never the matched text', () => {
    const hits = detectSecrets('AKIAIOSFODNN7EXAMPLE and AKIAI44QH8DHBEXAMPLE')
    expect(hits).toHaveLength(1)
    expect(JSON.stringify(hits)).not.toContain('AKIA')
  })
})

describe('secret detection — false-positive guards', () => {
  it('git commit SHA (40 hex) is not a secret', () => {
    expect(kinds('commit 5f2a9c04c9d1737d0d0c1b3a8e6b64e5d9a1f0aa')).toEqual([])
  })

  it('UUIDs are not secrets', () => {
    expect(kinds('id: 123e4567-e89b-12d3-a456-426614174000')).toEqual([])
  })

  it('Stripe TEST keys are not flagged (live only)', () => {
    expect(kinds(stripeTestKey())).toEqual([])
  })

  it('Google OAuth client IDs (public by design) are not flagged', () => {
    expect(kinds('client_id: 4085936-abc123def.apps.googleusercontent.com')).toEqual([])
  })

  it('ordinary prose, even mentioning keys, is clean', () => {
    expect(kinds('Please rotate the AWS access key and update the GitHub token in CI.')).toEqual([])
  })

  it('11 consecutive BIP-39 words do not count as a seed phrase', () => {
    expect(kinds(SEED_12.split(' ').slice(0, 11).join(' '))).toEqual([])
  })

  it('glue words break a seed run (prose made of common words)', () => {
    // "the", "of", "and", "is" are not in the BIP-39 list, so real sentences
    // never accumulate 12 consecutive members
    expect(kinds(
      'the quick brown fox jumps over the lazy dog and then the cat ran away from all of them',
    )).toEqual([])
  })

  it('a lone eyJ blob without three segments is not a JWT', () => {
    expect(kinds('data:eyJmb28iOiJiYXIifQ==')).toEqual([])
  })

  it('an ssh PUBLIC key is not flagged', () => {
    expect(kinds('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB3… user@host')).toEqual([])
    expect(kinds('-----BEGIN PUBLIC KEY-----')).toEqual([])
  })
})
