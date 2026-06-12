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
- **The verification log** stores metadata only: when and on which site a
  check happened, the field's label, the format used, the methods used, the
  outcome, and your attestation. It never contains the verified value. It
  lives in your browser's extension storage and is never transmitted.
- **Optional fingerprinting** (off by default): if you enable it, the log
  stores an HMAC-SHA-256 of the verified value, keyed with a random secret
  that never leaves your device. This lets you later prove a logged check
  corresponds to a specific value without the value being stored.
- **Settings, custom formats, and per-site format memory** are stored locally
  in extension storage.

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
