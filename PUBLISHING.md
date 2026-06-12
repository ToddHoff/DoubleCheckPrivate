# Double Check — Chrome Web Store Publishing Guide

First-time-publisher walkthrough, verified against current
(2025–2026) Chrome Web Store docs. Source links at the end.

## 1. One-time account setup (do this early — verification takes days)

1. Pick a **dedicated Google account** for publishing (the email can
   never be changed later) and enable **2-Step Verification** (mandatory
   to publish).
2. Go to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   pay the **one-time $5 registration fee**.
3. **Trader declaration (EU DSA):** because you charge money, you are a
   "trader." You must declare this and verify legal name, address,
   phone, and email — and this contact info is **shown publicly on your
   listing**. Consider an LLC + business address/phone if you don't want
   personal details public. Unverified traders lose EU distribution.
   Start this immediately; verification is the slow step.

## 2. Prepare the package

- Bump `version` in the manifest; build; ZIP the build output (manifest
  at ZIP root).
- MV3 rules that get extensions rejected: **no remotely hosted code**
  (everything in the ZIP — our bundled Tesseract complies; a CDN load
  would not), **no obfuscation** (minification is fine but plain builds
  review faster — consider shipping lightly-minified).
- Keep permissions exactly: `activeTab`, `scripting`, `storage`, `tts`,
  `offscreen` + the `https://extensionpay.com/*` content script. No
  broad host permissions — this is the difference between hours-to-days
  and weeks of review, especially on a brand-new account.

## 3. Store listing assets

| Asset | Spec |
|---|---|
| Store icon | 128×128 PNG (artwork ~96×96, 16 px transparent padding) — required |
| Screenshots | 1–5 at 1280×800 (preferred), square corners — at least 1 required; show the card going green on the practice form |
| Small promo tile | 440×280 — effectively required (listings without it rank lower) |
| Marquee | 1400×560 — optional, only for featured placement |

Listing fields: detailed description, category (**Productivity → Tools**
or Workflow), language. Lead the description with the privacy promise.

## 4. Privacy tab (the part that gets first extensions rejected)

- **Single-purpose statement:** "Helps users verify high-stakes values
  (account numbers, amounts) entered into web forms, locally on their
  device."
- **Per-permission justifications** (write these out):
  - `activeTab`/`scripting`: "Injects the verification card into the
    page only when the user presses the shortcut or clicks the toolbar
    icon."
  - `storage`: "Stores settings, user-defined format validators, and an
    audit log that never contains the verified values."
  - `tts`: "Optionally reads a value aloud using local device voices."
  - `offscreen`: "Runs on-device OCR (bundled Tesseract WASM) so images
    are never uploaded."
  - extensionpay.com content script: "Payment/licensing callbacks for
    ExtensionPay."
- **Remote code:** declare **No**.
- **Data-use disclosures:** even though values are processed locally,
  Google counts local processing as "handling" — check **Financial and
  payment information** (processed locally, never transmitted) and
  **Personally identifiable information** (email, transmitted to
  ExtensionPay/Stripe for payment only). Certify the three checkboxes
  (no sale, no unrelated use, no creditworthiness use).
- **Privacy policy URL: required.** Host a static page stating: all
  verification happens on-device; values are never transmitted, logged,
  or stored; the audit log stores metadata only; the only network
  traffic is licensing with ExtensionPay (email + payment status, via
  Stripe); no analytics. This page is also your best marketing copy.

## 5. Distribution tab

- Mark the item as containing **in-app purchases** (listing a paid
  extension as "free" is a deceptive-behavior violation).
- Visibility: start **Unlisted** for beta (installable by direct link
  only — send it to your wife's office), flip to **Public** when ready.
  Flipping visibility does not require re-review of unchanged code.

## 6. Review & launch

- Provide **test instructions** for reviewers: how to invoke the
  shortcut, the practice form, and an ExtPay test login if features are
  gated (or temporarily un-gate core flow for the review build).
- Typical review: ~90% within 3 days; new account + first extension can
  take longer. >3 weeks → contact support.
- After approval you have **30 days** to hit Publish before it reverts
  to draft.

## 7. Updates & ops

- Updates = upload new ZIP with bumped version; each update is
  re-reviewed (scope depends on changes; permission changes = slower).
- One-click **rollback** to the previous version exists in the
  dashboard. Percentage rollout only unlocks at >10k weekly users.
- Account-suspension pitfalls: never create a second account to dodge a
  rejection (related-account termination), keep data disclosures in
  sync with behavior, respond to policy emails within their cure window.

## Sources

- Registration: developer.chrome.com/docs/webstore/register
- 2SV: developer.chrome.com/docs/webstore/program-policies/two-step-verification
- Trader/DSA: developer.chrome.com/docs/webstore/program-policies/trader-disclosure
- Publish flow: developer.chrome.com/docs/webstore/publish
- Images: developer.chrome.com/docs/webstore/images
- Privacy tab: developer.chrome.com/docs/webstore/cws-dashboard-privacy
- User-data FAQ: developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Review process: developer.chrome.com/docs/webstore/review-process
- MV3 requirements: developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Payments deprecation (third-party payments are the sanctioned path):
  developer.chrome.google.cn/docs/webstore/cws-payments-deprecation
- Distribution/visibility: developer.chrome.com/docs/webstore/cws-dashboard-distribution
- Updates/rollback: developer.chrome.com/docs/webstore/update
