# Double Check — Privacy Policy

_Last updated: June 2026._

<!-- Canonical hosted copy (keep in sync with this file):
     https://github.com/ToddHoff/DoubleCheckPublic/blob/main/privacy-policy.md
     This URL goes in the Chrome Web Store listing's Privacy tab. -->

Double Check helps you verify high-stakes values (account numbers, routing
numbers, amounts, IDs) entered into web forms. It is built on one principle:

**The values you verify never leave your computer.**

## What we process, and where

- **Verified values** (the numbers you check) are processed entirely on your
  device, in memory, and are never transmitted, logged, or stored. Not even
  in hashed form, unless you explicitly enable the optional fingerprint
  setting described below.
- **Images** you scan or paste for comparison are read by a bundled, offline
  copy of the Tesseract OCR engine on your device and discarded after text
  extraction. They are never uploaded anywhere.
- **Read-aloud** uses your device's local text-to-speech voice. Voices that
  would send text to a network service are never used.
- **Voice input** uses Chrome's on-device speech recognition (the model is
  downloaded once by Chrome itself). Your audio and the transcript never
  leave your device; if on-device recognition isn't available, the feature
  is disabled rather than falling back to any cloud service. Chrome's
  microphone permission prompt names the website you're on — that is how
  browsers attribute extension features running in a page — but the audio
  is processed only on-device and the transcript is seen only by Double
  Check, never by the website.
- **The verification log** stores metadata only: when and on which site a
  check happened, the field's label, the format used, the methods used, the
  outcome, and your attestation. It never contains the verified value. It
  lives in your browser's extension storage, on your device only, and is
  never transmitted — we have no servers it could be sent to and no ability
  to access, see, or retrieve it.
- **Signatures and notes you type** are stored with the log entry when you use
  them: the names entered for a field that requires two signatures, and any
  note you add to a check. This is text you choose to enter; keep the verified
  value out of it (the value is never stored). Like the rest of the log, it
  stays on your device and is never transmitted.
- **A tamper-evident seal** is computed for each log entry: a keyed hash
  chained to the previous entry, using a random key that never leaves your
  device. It lets you detect later edits, removals, or reordering of the log
  on this device. It is not identity authentication or a legal record.
- **Optional fingerprinting** (off by default): if you enable it, the log
  stores an HMAC-SHA-256 of the verified value, keyed with a random secret
  that never leaves your device. This lets you later prove a logged check
  corresponds to a specific value without the value being stored.
- **Settings, custom formats, per-site format memory, and per-field
  two-signature requirements** are stored locally in extension storage.
- **Verifying a field sealed in a secure frame** (only if you grant that site —
  see Permissions): some values, such as a card number rendered inside a
  payment processor's cross-origin frame, can't be reached the normal way. If
  you grant access to that site, Double Check reads the value locally and
  relays it between the page's own frames (the frame → the extension's service
  worker → the page's top frame) solely to run the check at that moment. It is
  never written to storage and never sent over the network. Without your
  per-site grant, no value is ever read this way.

## Network traffic

The extension's only network communication is license verification with
ExtensionPay (extensionpay.com), our payment provider. ExtensionPay and its
payment processor Stripe receive the email address you provide at checkout
and your payment status. See their policies:
https://extensionpay.com/privacy and https://stripe.com/privacy.

There are no analytics, no telemetry, no error reporting, and no other
network requests of any kind.

## Permissions

- **activeTab + scripting**: lets the extension open its verification card on
  a page — only when you press the keyboard shortcut or click the toolbar
  icon on that page. The extension has no standing access to any website.
- **Optional site access (off by default)**: Double Check installs with access
  to no website at all. To verify a field sealed inside a cross-origin frame
  (e.g. a card number in a payment processor's iframe), it must be allowed onto
  that site. It asks Chrome for access to that **one** site, on your click, the
  first time you choose to verify such a field there. The grant is per-site and
  revocable any time in Settings → Site access; nothing is granted unless you
  opt in. (Technically declared as `optional_host_permissions`; we request only
  the specific site you're on, never all sites up front.)
- **storage**: settings, custom formats, and the metadata-only log.
- **offscreen**: runs the bundled OCR engine.
- **alarms**: deletes old log entries per your retention setting.

## Data sharing and sale

We do not collect your data, so we cannot share or sell it. We do not use
your data for advertising, creditworthiness, or any purpose at all beyond
the local functioning of the extension described above.

## Your controls

You can clear the verification log, export it, change its retention period,
disable fingerprinting (it is off by default), and remove all stored data by
uninstalling the extension. All of this is local to your browser.

## Contact

Questions: tmh@possibility.com
