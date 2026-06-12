# Double Check — Implementation Plan

Companion to DESIGN.md. Stack, layout, phases, and testing.

## 1. Stack

- **TypeScript + Vite + @crxjs/vite-plugin** — HMR for content scripts,
  manifest as typed source, standard MV3 tooling.
- **No UI framework** for the injected card (vanilla TS + shadow DOM —
  smallest payload, no CSS bleed, fastest injection). Options page may
  use Preact if it earns its weight; start vanilla.
- Runtime deps: `extpay`, `tesseract.js` (v5+, fully bundled: worker,
  core WASM, `eng.traineddata` — no CDN, MV3 forbids remote code).
- Dev deps: `vitest` (unit), `playwright` (E2E with extension loaded),
  `web-ext lint`, `eslint` + rule banning `console.*` in src.

## 2. Repository layout

```
double-check/
├── manifest.config.ts          # typed manifest (crxjs)
├── src/
│   ├── background/
│   │   ├── index.ts            # commands handler, injection, routing
│   │   ├── license.ts          # ExtPay wrapper + offline-grace cache
│   │   └── offscreen-manager.ts
│   ├── content/
│   │   ├── index.ts            # entry: find focused field, mount card
│   │   ├── card/               # shadow-DOM UI (input/verify modes)
│   │   ├── field.ts            # field detection, native-setter write,
│   │   │                       #   tamper watch, badge
│   │   ├── compare.ts          # normalization, diff, transposition
│   │   └── submit-guard.ts
│   ├── engine/                 # PURE — no chrome.* imports, fully unit-testable
│   │   ├── validators/         # one file per built-in format
│   │   ├── checksums.ts        # luhn, mod97, aba, damm, verhoeff,
│   │   │                       #   clabe, cusip, isin, vin, weighted-mod
│   │   ├── detect.ts           # format suggestion from field signals
│   │   └── spec.ts             # declarative validator schema + runner
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   └── ocr.ts              # tesseract glue, local paths only
│   ├── options/                # settings, validator editor, log, docs
│   ├── onboarding/             # 4-step first run + practice form
│   ├── popup/
│   └── shared/                 # messages.ts (typed runtime messages),
│                               #   storage.ts, constants.ts
├── public/                     # icons, tesseract core+traineddata
├── docs/                       # privacy policy, ToS sources
└── tests/
    ├── unit/                   # engine: golden checksum vectors
    ├── e2e/                    # playwright + test pages
    └── pages/                  # plain-form, React, Vue fixture forms
```

Rule: **`engine/` is pure** (string in → result out). All the
correctness-critical math lives there with exhaustive tests; everything
chrome-flavored stays thin.

## 3. Key technical decisions (researched, not guessed)

| Decision | Basis |
|---|---|
| Shortcut → inject, zero host permissions | `commands` event counts as the user gesture that grants `activeTab`; `scripting.executeScript` then works. Officially documented pattern; avoids the slow-review track. |
| `_execute_action` not used; named command `check-field` | We need the service worker to run injection logic, not just open the popup. Suggested default `Ctrl+Shift+Space` (≤4 suggested shortcuts allowed; users rebind at `chrome://extensions/shortcuts`). |
| OCR in offscreen document | Service worker has no DOM/canvas; offscreen doc is the MV3 home for WASM+canvas work. CSP `wasm-unsafe-eval` is in the MV3 default — Tesseract v4+ needs nothing more. |
| Image paste = `paste` event in card input | Zero permissions, works for files and phone screenshots. `navigator.clipboard.read()` (programmatic) deliberately avoided — needs more permission and adds nothing. |
| Region capture via `chrome.tabs.captureVisibleTab` | Allowed under `activeTab`. Crop with OffscreenCanvas before handing to Tesseract. |
| TTS via page `speechSynthesis`, filter `voice.localService === true` | (Revised from `chrome.tts` during implementation.) Same local-voice guarantee, but the value never leaves the content script and the `tts` permission is dropped entirely. If no local voice exists, the feature hides itself. |
| Writing into fields: native setter + synthetic events | `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v)` then dispatch `input`+`change`, else React-controlled inputs ignore the write. |
| ExtPay `getUser()` wrapped with our own grace cache | It throws offline; we persist last status + timestamp and honor `paid` for 7 days unreachable. |
| User validators are declarative JSON | No eval/Function — MV3 remote-code policy and basic security on banking pages. |

## 4. Phases

Each phase ends green: builds, lints, tests pass, manually exercised on
the fixture pages.

### Phase 0 — Scaffold (small)
Repo, Vite+crxjs, manifest with final permission set, CI (typecheck,
vitest, web-ext lint, console-ban lint rule), empty-but-wired
background/content/options/popup, loads unpacked.

### Phase 1 — Engine (the moat)
All built-in validators + checksum library with **golden test vectors**
(known-good routing numbers, IBANs from ECB examples, Luhn cards, CUSIP
etc., plus near-misses: each with one digit changed, each with adjacent
transposition — the test must prove checksums catch what regexes can't).
Normalization, format detection from field signals, mismatch diagnosis
(transposition/substitution/insertion classifier). Pure TS, no chrome.

### Phase 2 — Core loop
Command → inject → card on focused field. Verify mode: format chip +
picker, blind double entry, chunked visual compare, green/red +
diagnosis, attestation, badge, tamper watch. Log writes (schema from
DESIGN §8). Settings skeleton. Works end-to-end on the plain-HTML
fixture form. **This is the demo milestone.**

### Phase 3 — Input mode + robustness
Input mode with native-setter write; verified against React and Vue
fixture forms. Per-site field→format memory. TTS read-aloud (local
voices, default off). Popup fallback activation. Edge cases:
iframes (inject into the focused frame via `frameIds`), `contenteditable`
fields, shadow-DOM fields (degrade gracefully: card works detached from
the field with copy-out).

### Phase 4 — OCR
Offscreen document + bundled Tesseract. Paste-image path, then region
capture + crop UI. Extract candidates by selected format, compare,
same green/red flow. Performance target: < 3 s for a phone screenshot
on a mid laptop (preload the worker when the card opens).

### Phase 5 — Validator editor, log viewer, docs, onboarding
Form-based editor with live test box, import/export JSON. Log viewer +
CSV/JSON export + retention purge (chrome.alarms). Bundled docs pages
with the privacy explainer front and center. Onboarding flow + practice
form.

### Phase 6 — Licensing
ExtPay integration (`startBackground`, trial pages, `onPaid`,
deep-linked plans), grace cache, paywall surfaces (trial banner in card,
expiry behavior per DESIGN §9 — core double-entry never bricks).
Register the extension + plans on extensionpay.com; test-mode purchases
with Stripe test cards.

### Phase 7 — Submit Guard (beta) + hardening
Capture-phase submit + submit-button click interception, per-site
opt-in, honest-limits copy. Accessibility pass (keyboard-only loop,
contrast, focus traps, screen-reader labels). Security self-review:
grep `console.`/`fetch(`, verify no value crosses runtime messages
except card↔offscreen image path.

### Phase 8 — Ship
Store assets (128 icon, 1280×800 screenshots, 440×280 tile), privacy
policy + ToS hosted (one static page is enough), listing copy,
unlisted-visibility beta with real users (the accountant), then public.
Details in PUBLISHING.md.

Rough sizing for a competent solo dev: phases 0–2 ≈ 2–3 weeks, 3–5 ≈
3–4 weeks, 6–8 ≈ 2–3 weeks. ~2 months part-time to public listing.

## 5. Testing strategy

- **Unit (vitest):** every checksum with published vectors + mutation
  near-misses; validator spec runner; detection heuristics; diff/
  transposition classifier. This suite is the product's credibility —
  aim for exhaustive, not representative.
- **E2E (playwright, real Chromium with extension):** fixture pages
  (plain form, React-controlled, Vue, iframe form). Script: focus field,
  fire shortcut (via CDP), complete double entry, assert badge + log
  entry + that the log contains no value substring.
- **Manual matrix before each release:** Gmail compose (contenteditable),
  a real bank sandbox if available, Google Forms, an SPA checkout.
- **Privacy regression test:** E2E asserts zero network requests to
  anything but extensionpay.com across a full verify flow (playwright
  network interception).
