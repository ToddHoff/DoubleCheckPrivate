# Double Check — Design

A Chrome extension that helps users verify high-stakes values (account
numbers, routing numbers, amounts) before they commit them, without the
value ever leaving the machine.

**One-line pitch:** "A second pair of eyes for the numbers that can't be
wrong."

## 1. Problem

People hand-transfer critical values from a *source* (paper, phone, PDF,
email, another app) into a *target* (a web form field). A single
transposed digit in a wire transfer is a catastrophe. Today the
mitigation is "ask someone to look over your shoulder." Double Check
automates the second pair of eyes.

## 2. Core principles

1. **The value never leaves the machine.** No network calls carry the
   value. No logging of the value. No storage of the value (not even
   hashed, by default). OCR and text-to-speech run on-device only.
2. **Verification, not guarantee.** The product is an *assistive
   double-check*. UI copy, attestation wording, and ToS all place final
   responsibility on the user. (See §10 Liability.)
3. **Minimal permission footprint.** No host permissions. The extension
   can only see a page when the user explicitly invokes it there
   (`activeTab` granted by the keyboard shortcut).
4. **Checksums over regexes.** Wherever a format has real math (ABA
   routing mod-10, IBAN mod-97, Luhn, CUSIP/ISIN check digits), we
   compute it. A regex says "looks like a routing number"; a checksum
   says "is internally consistent." This is the headline feature.

## 3. Mental model & primary flow

```
source (paper / phone / PDF / email / image)
        │  human transcription — the risky step
        ▼
target field (web form)  ──Ctrl+Shift+Space──▶  Double Check card
                                                  │
                              ┌───────────────────┤
                              ▼                   ▼
                        INPUT MODE          VERIFY MODE
                       (field empty)      (field has value)
                              │                   │
                              └───────┬───────────┘
                                      ▼
                          format detect/select → validate
                                      ▼
                          one or more verify methods
                                      ▼
                          attestation checkbox → log (no value)
                                      ▼
                          green "Verified" badge on field
```

1. User focuses the target field, presses the shortcut (default
   `Ctrl+Shift+Space`, Mac `⌘+Shift+Space`; user-rebindable at
   `chrome://extensions/shortcuts`).
2. Service worker receives the `chrome.commands` event. The shortcut is
   a user gesture, so Chrome grants `activeTab`; the worker injects the
   content script via `chrome.scripting.executeScript`. **No host
   permissions needed** — this is the officially documented pattern.
3. The content script renders a card (shadow DOM, anchored next to the
   focused field). Empty field → Input mode. Non-empty → Verify mode.
4. Card suggests a format (see §5), user confirms or picks another.
5. User completes one or more verification methods (§6).
6. User checks the attestation box; an audit entry is written (§8) and a
   "✓ Double-Checked" badge is pinned beside the field.
7. **Tamper watch:** the content script keeps listening to the field. If
   the value changes after attestation, the badge flips to a warning
   ("value changed after verification") and the log entry is marked
   stale. This closes the "verified, then fat-fingered" hole.

Fallback activation: toolbar popup with a "Check focused field" button,
for pages/users where the shortcut is awkward. Same `activeTab` grant
(toolbar click is also a gesture).

## 4. Architecture (Manifest V3)

| Component | Responsibility |
|---|---|
| Service worker | `chrome.commands` handler, on-demand injection, ExtPay licensing, offscreen-document lifecycle, TTS dispatch |
| Content script (injected on demand) | Field detection, card UI in closed shadow DOM, comparison logic, submit guard, tamper watch. **All value handling stays here, in memory.** |
| Offscreen document | Tesseract.js OCR (WASM, bundled). Receives image bytes via runtime message, returns extracted text, holds nothing. |
| Options page | Settings, validator editor, audit log viewer/export, documentation |
| Onboarding page | First-run walkthrough + privacy explainer + trial start |
| Popup | Status (license, shortcut hint), "check focused field" button |

**Permissions:** `activeTab`, `scripting`, `storage`, `tts`, `offscreen`,
`commands` (manifest key, not a permission). ExtPay needs a content
script matched to `https://extensionpay.com/*` for payment callbacks —
that is the only host entry in the manifest, and it's ExtPay's domain,
not user pages. No `<all_urls>`, no `tabs`. This keeps the install
warning small and the store review fast.

**Storage (`chrome.storage.local`):** settings, user-defined validators,
per-site field→format memory, audit log entries. Never any field value.
Optional `chrome.storage.sync` for settings/validators only (off by
default; log never syncs).

**Where the value lives:** only in the content script's memory and the
page's own DOM (where it already was). Comparison, normalization, and
checksum math all run in the content script. The only cross-context
transfer is the OCR image → offscreen document, which stays inside the
extension process and is discarded after extraction. Nothing
value-derived crosses to the service worker or storage.

## 5. Format engine

### Detection (suggestion only — user always confirms)

Signals, in priority order:
1. Per-site memory: this origin + field signature was used before with
   format X.
2. Field attributes: `autocomplete` (`cc-number`!), `name`, `id`,
   `inputmode`, `maxlength`, `pattern`, associated `<label>` text.
3. Heuristics on the existing value (length, charset, passes which
   checksums).

The card shows the guess as a pre-selected chip with a dropdown of all
formats. Wrong guesses cost one click.

### Built-in validators (v1 set)

| Format | Validation beyond shape |
|---|---|
| ABA routing number | 9 digits + mod-10 weighted 3-7-1 checksum |
| IBAN | per-country length table + mod-97 == 1 |
| Credit/debit card | Luhn + brand prefix/length consistency |
| US SSN | area ≠ 000/666/9xx, group ≠ 00, serial ≠ 0000 |
| US EIN | valid prefix list |
| US bank account number | length range 4–17 digits (no public checksum exists — say so honestly in the UI) |
| SWIFT/BIC | 8/11 chars, structure (bank/country/location codes), ISO country code |
| UK sort code | 6 digits, XX-XX-XX grouping |
| Mexico CLABE | 18 digits + weighted mod-10 check digit |
| Currency amount | locale-aware parse, currency picker, explicit cents confirmation ("one million two hundred thousand and 00/100") |
| CUSIP | 9 chars + check digit |
| ISIN | 12 chars + Luhn-over-converted |
| Bitcoin address | Base58Check / bech32 checksum |
| Ethereum address | EIP-55 mixed-case checksum |
| VIN | 17 chars + position-9 check digit |
| Phone (E.164) | country code + length |
| Email | RFC-lite shape check |
| Date | format picker (MDY/DMY/ISO) + real-date check — catches 06/13 vs 13/06 |
| Generic number / Generic text | length + charset only |

Amount + date + account in one card is most of an accountant's wire
form.

### Validator spec (declarative JSON — no code execution)

User-defined validators are data, not code. This is non-negotiable:
MV3 bans remote code, and `eval` of user input in a tool that touches
bank pages would be indefensible.

```json
{
  "id": "acme-vendor-id",
  "name": "Acme vendor ID",
  "normalize": ["trim", "strip-spaces", "strip-dashes", "uppercase"],
  "pattern": "^V[0-9]{7}$",
  "length": { "min": 8, "max": 8 },
  "checksum": null,
  "grouping": [1, 3, 4],
  "speech": "char-by-char",
  "notes": "Vendor IDs from the Acme portal, V + 7 digits"
}
```

- `checksum` selects from a built-in algorithm menu: `luhn`, `mod97`,
  `aba`, `damm`, `verhoeff`, `clabe`, `cusip`, `isin`, `vin`, or
  parameterized `weighted-mod` (weights + modulus + check position) —
  which covers most real-world schemes without arbitrary code.
- `grouping` controls chunked display (e.g. `[3,3,3]` renders
  `123 456 789`) and TTS pacing.
- Import/export as JSON files → teams can share validator packs.

### Validator editor

In the options page: form-based (not raw JSON), with a live test box —
type sample values, see pass/fail and which rule fired. Built-ins are
read-only but cloneable as starting points.

## 6. Verification methods

| Method | How | Default |
|---|---|---|
| **Blind double entry** | Card masks the field's value, user re-types it from the *source* (not from the field — that's the point), compare after normalization. Match → everything green. Mismatch → red + character-level diff. | **On — the core method** |
| **Mismatch diagnosis** | On mismatch, classify the error: adjacent transposition ("digits 5–6 swapped?"), single substitution, missing/extra digit, wrong chunk. Transpositions are the classic accounting error; naming it builds trust. | Always with double entry |
| **Checksum check** | Instant, automatic for formats that have one. Catches typos even without double entry. | Always |
| **Chunked visual compare** | Show the value huge, chunked per format (`021 000 021`), high contrast, optional digit-color-coding, for eyeball compare against the source. | On |
| **Read-aloud (TTS)** | Page `speechSynthesis` from the content script, **local voices only** (`localService` filtered), digit-by-digit with grouping pauses. (Changed from `chrome.tts` during implementation: the value then never leaves the content script and the `tts` permission is dropped.) | **Per-card 🔊 button, click-to-speak** — each use is an explicit opt-in, so no global setting (revised from a global off-by-default toggle at Todd's request) |
| **OCR compare** | User pastes an image into the card (`⌘V` — paste events need zero permissions, works for phone screenshots via Universal Clipboard, snips of PDFs) **or** captures a screen region (`captureVisibleTab` + drag-crop, allowed under `activeTab`). Tesseract.js (bundled WASM, offscreen doc) extracts text locally; we scan for substrings matching the selected format and compare. | On (paid tier) |
| **Voice input** | User reads the source aloud; on-device SpeechRecognition (`processLocally: true`, Chrome 139+ only) transcribes **directly in the content script** — Chrome forbids speech recognition in cross-origin iframes outright (verified empirically; an extension-iframe design cannot work on real pages), so the mic prompt names the website, while the transcript stays inside the content script with no messaging at all. Digit words are normalized and run through the same candidate extraction as OCR. Never cloud recognition — if on-device is unavailable the button disables itself. | Per-card "Speak it" button, click-to-use |

### Input mode (empty field)

Same card, reversed direction: user enters the value *into the card*
(typed, pasted, or OCR'd), format-validates, blind-re-enters to confirm,
then the card writes it into the field — using the native value setter +
synthetic `input`/`change` events so React/Vue/Angular forms register it.
Then standard attestation. This turns "input + validation" into one flow.

### Submit Guard (opt-in, labeled beta)

Per-site toggle. While a checked field on the page is unverified or
stale, a capture-phase `submit` listener blocks submission and flashes
the card; submit buttons get a visual lock.

Honest limits (documented in-product): programmatic `form.submit()`
doesn't fire the event, and SPAs that POST via `fetch` from click
handlers bypass `submit` entirely. We intercept capture-phase clicks on
`type=submit` buttons as a second layer, but this remains best-effort —
which is why it's opt-in and why attestation (the human) stays the
primary control, not the guard (the machine).

## 7. Workflows

1. **Onboarding** (first run): 4 screens — (a) what it does, (b) privacy
   promise in plain words ("your numbers never leave this computer —
   here's how"), (c) set/confirm the shortcut + try it on a built-in
   practice form (a bundled fake "wire transfer" page — lets users learn
   on something safe), (d) start 7-day trial via ExtPay.
2. **Verify a value** (§3/§6 — the daily loop, target < 10 seconds for
   double entry).
3. **Input a value** (§6 Input mode).
4. **Manage validators** (§5 editor; import/export packs).
5. **Review/export the log** (§8).
6. **Trial → pay → manage subscription** (ExtPay pages; license check
   cached for offline grace, §9).
7. **Docs**: bundled in the options page (works offline; nothing to
   exfiltrate to a docs site) + same content on the marketing site.

## 8. Audit log — proof without the value

Each attested verification stores:

```json
{
  "at": "2026-06-11T17:42:03Z",
  "origin": "https://wires.examplebank.com",
  "fieldLabel": "Beneficiary account number",
  "format": "us-bank-account",
  "methods": ["double-entry", "checksum"],
  "result": "match",
  "attested": true,
  "valueLength": 10,
  "durationMs": 9200
}
```

- **Never the value.** Default fingerprint is length only.
- Optional **HMAC fingerprint** (off by default): HMAC-SHA-256 of the
  normalized value with a per-install random key that never leaves
  `storage.local`. Lets a user later prove "the value I verified is the
  same one in this statement" by re-computing. Trade-off stated plainly
  in settings: if both the log and the key are exfiltrated from the
  machine, low-entropy values (9-digit numbers) are brute-forceable.
  Hence off by default.
- Tamper-watch marks entries `stale: true` if the field changed after
  attestation.
- Viewer in options page; CSV/JSON export (download via blob URL — no
  extra permission). Retention setting: 30/90/365 days/forever,
  auto-purge.

## 9. Licensing & pricing (ExtPay)

- ExtPay id `double-check`; plans `double-check-monthly`,
  `double-check-yearly`. `extpay.startBackground()` in the service
  worker; `extpay.openPaymentPage('double-check-yearly')` deep-links a
  plan; `onPaid` via the extensionpay.com content script.
- **7-day free trial** (`openTrialPage`), enforced by us from
  `trialStartedAt`.
- **Offline grace:** `getUser()` throws with no network. We cache the
  last known status + timestamp ourselves and honor `paid` for 7 days of
  unreachability before degrading. An accountant mid-wire must never be
  blocked by our license server. Degraded mode = core double-entry still
  works; this is also the safety-ethical position (never let a paywall
  stop a safety check that's already installed).

### Price-point recommendation

$1.99/$15 is underpriced for this audience, and the yearly is discounted
too steeply (37% off; the norm is ~2 months free ≈ 17%).

- The buyer is a professional avoiding catastrophic, career-level
  errors; the comparison isn't other $2 extensions, it's the cost of one
  miswired payment. Utility extensions for professionals routinely
  charge $4–10/month and are expensed.
- At $1.99, ExtPay's 5% + Stripe's ~2.9% + $0.30 take ~20% of every
  monthly charge. At $4.99 they take ~12%.
- Low price doesn't buy volume in a niche tool; trust does. A
  too-cheap price can actually *hurt* credibility for a financial-safety
  product.

**Recommendation:** **$4.99/month, $39/year** (≈35% off — keep yearly
attractive since retention is the business), 7-day trial, plus a
**$99 lifetime** one-time plan (`double-check-lifetime`) — 2.5–3× annual
is the standard lifetime multiple, it slightly exceeds expected
subscriber LTV (18–30 month typical retention), and it captures the
subscription-averse segment while anchoring the yearly price. Optional
launch promo: $79 "founding user" for the first cohort. The ToS scopes
"lifetime" to this product (the extension + updates), not future
products like the Windows app. If install volume
matters more than near-term revenue, a freemium split is the strongest
funnel: free = double entry + built-in formats; paid = OCR, TTS, audit
log export, custom validators, submit guard. Freemium maximizes reviews
and word-of-mouth in offices — one free user evangelizes, the firm pays.

A future Windows native app (same engine, system-wide) is a natural
$9.99/mo "Pro/Desktop" tier and a reason to keep the extension's brand
name format-agnostic.

**Site licenses (decided June 2026, deferred post-launch):** when the
first whole-office request arrives, the mechanism is a signed site key
via `chrome.storage.managed` — IT deploys the extension by Google Admin
policy and pastes an Ed25519-signed key (company, seat count, expiry)
into the extension's managed policy; `getLicenseStatus()` checks managed
storage before ExtPay, fully offline. Needs only a key-signing script,
~30 lines in license.ts, a managed-storage schema, and an IT-admin doc;
invoice manually through Stripe. Flat tiers (e.g. ≤10 seats / ≤50 seats /
custom). Until then, shared-email activation or ExtPay discount codes
cover small offices.

## 10. Liability posture

- Attestation copy does the legal work: "**I have personally compared
  this value against the source and confirm it is correct.** Double
  Check assists verification; responsibility for the value remains
  mine."
- ToS/EULA: tool provided "as is," no warranty of accuracy, no liability
  for financial loss; the log records *that the user attested*, not that
  the value was objectively correct.
- Marketing language discipline: "helps you double-check," never
  "guarantees," "prevents," or "ensures." The badge says
  "Double-Checked," not "Correct."
- Have a lawyer review the ToS before launch — cheap insurance for a
  product aimed at wire transfers.

## 11. Privacy & security checklist

- No analytics, no telemetry, no error reporting that could carry values.
- Only network endpoint: extensionpay.com (license). Privacy policy
  states exactly this, including that ExtPay/Stripe see the user's email
  for payment — the one real data flow.
- Card UI in **closed** shadow DOM; inputs use `autocomplete="off"`;
  no value ever placed in `document.title`, URLs, or console.
- Code review rule: grep for `console.` and any `fetch(` outside the
  ExtPay module before every release.
- CSP: MV3 default (`script-src 'self' 'wasm-unsafe-eval'`) — Tesseract
  v4+ is compatible; everything bundled, nothing remote.

## 12. Product ideas that make it stronger (beyond the brief)

1. **Checksum math as the headline** — "we don't just compare, we verify
   the number is internally valid" is the demo-able wow.
2. **Mismatch diagnosis** (transposition detection) — turns a red X into
   an explanation.
3. **Tamper watch** — verification that survives until submit, not just
   at a moment in time.
4. **Per-site memory** — second use on the same bank portal is
   zero-config.
5. **Practice form in onboarding** — learn on a fake wire transfer, not
   a real one.
6. **Transaction bundles** (v2) — verify amount + account + routing as
   one named group ("Vendor payment — Acme"), one log entry, one badge.
7. **Validator packs** — shareable JSON ("US payroll pack," "EU treasury
   pack") seeds a community/SEO channel and a future team tier.
8. **Accessibility as a feature** — huge chunked type, high-contrast and
   color-blind-safe match colors (green/red plus icons ✓/✕), optional
   dyslexia-friendly font. The audience squints at small numbers all day.
9. **Keyboard-only flow** — invoke, verify, attest, close without
   touching the mouse. Accountants live on the keyboard.
10. **Stats that don't leak** — local-only counter: "412 values
    double-checked, 17 mismatches caught." The retention screen writes
    the renewal email for you.
