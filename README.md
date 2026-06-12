# Double Check

A second pair of eyes for the numbers that can't be wrong. Chrome extension
(Manifest V3). Design in [DESIGN.md](DESIGN.md), build plan in
[IMPLEMENTATION.md](IMPLEMENTATION.md), store guide in
[PUBLISHING.md](PUBLISHING.md).

## Develop

```bash
npm install
node scripts/gen-icons.mjs   # regenerate icons (committed under public/)
npm run build                # typecheck + vite build → dist/
npm test                     # engine unit tests (vitest)
npx playwright test          # E2E smoke in real Chromium (loads dist/)
npm run check:privacy        # no console.*, no network outside src/payments
npm run zip                  # dist → double-check.zip for store upload
```

Load unpacked: `chrome://extensions` → Developer mode → Load unpacked →
select `dist/`.

## Architecture in one paragraph

No host permissions. The keyboard shortcut (or toolbar click) grants
`activeTab`; the service worker injects the content script on demand, which
mounts a closed-shadow-DOM card next to the focused field. All validation
(`src/engine/` — pure, fully unit-tested) and comparison run in the content
script; verified values never cross to other contexts, except images sent to
the offscreen document for bundled-Tesseract OCR. The audit log
(`chrome.storage.local`) stores metadata only, never values. Read-aloud uses
the page's `speechSynthesis` with local voices only. The only network
endpoint is extensionpay.com (licensing).

## Before first release (one-time setup)

1. **ExtensionPay**: register the extension at extensionpay.com with id
   `double-check`; create plans `double-check-monthly` and
   `double-check-yearly`. Test with Stripe test cards (see ExtPay README).
2. **Hosted docs** (done): the public copies live at
   [DoubleCheckPublic/privacy-policy.md](https://github.com/ToddHoff/DoubleCheckPublic/blob/main/privacy-policy.md)
   and [DoubleCheckPublic/terms.md](https://github.com/ToddHoff/DoubleCheckPublic/blob/main/terms.md).
   Still TODO there: fill in the support-email / legal-entity placeholders and
   drop the "Host this page publicly" editor note from the privacy policy.
   Keep them in sync with `docs/` in this repo.
3. **Chrome Web Store**: follow [PUBLISHING.md](PUBLISHING.md) — register the
   $5 developer account, complete trader (DSA) verification early, then
   upload `double-check.zip`.

## Release checklist

- [ ] `npm run build` green, `npm test` green, `npx playwright test` green
- [ ] `npm run check:privacy` clean
- [ ] Version bumped in `package.json` (manifest version derives from it)
- [ ] Manual pass on `tests/pages/all-formats.html` (every built-in format,
      valid + invalid samples inline) + one real SPA form
- [ ] `npm run zip`, upload, update store listing if screenshots changed
