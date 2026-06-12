# Chrome Web Store listing copy

Paste-ready text for the Store Listing tab. The dashboard's description
field is plain text — headers are caps lines, bullets are "•".

## Detailed description

A second pair of eyes for numbers that can't be wrong.

One transposed digit in a wire transfer sends money to the wrong account. Double Check turns the careful-but-manual ritual — read it, re-read it, ask a colleague to look over your shoulder — into a fast, verifiable workflow that happens right in the field you're typing into. And the values you check never leave your computer.

HOW IT WORKS

Click into the field and press the keyboard shortcut (or right-click → "Double-check this field"). Double Check detects the format, verifies the math, and has you re-type the value from your source document — two independent readings must agree before you attest. Green means match. Red shows exactly what's wrong: "characters 5 and 6 appear swapped" — because transposed digits are the classic transcription error, and naming the mistake beats just flagging it.

REAL VALIDATION, NOT JUST PATTERNS

• 23 built-in formats: US routing numbers (ABA), IBAN, payment cards, SSN, EIN, SWIFT/BIC, UK sort codes, CLABE, CUSIP, ISIN, VIN, Bitcoin and Ethereum addresses, phone numbers, email, dates, and currency amounts
• Formats with check digits are verified mathematically — a single wrong digit in a routing number, IBAN, or card number is caught instantly, often before you re-type anything
• Currency amounts parse US and European separators, refuse genuinely ambiguous ones ("1,234" could be two different numbers — Double Check won't guess), and confirm in words: 1,200,000.00 — one million two hundred thousand and 00/100

MORE WAYS TO VERIFY

• Compare against an image: scan a screen region or paste a screenshot or phone photo — read by a bundled OCR engine on your device, never uploaded
• Speak it: read the value aloud from the paper in your hand; Chrome's on-device speech recognition transcribes it (Chrome 139+), and nothing leaves your machine
• Hear it read back digit by digit by a local on-device voice, at the speed you choose
• Empty fields get safe two-step entry: type the value, then re-type it blind — only a matching pair is written into the field

PROOF IT HAPPENED

• Every attested check is logged: when, where, which field, what format, which methods, and your attestation — never the value itself
• A "Double-Checked" badge marks the verified field, and flips to a warning if the value changes afterwards
• Export the log to CSV or JSON for your records; retention is yours to set

MADE FOR REAL WORK

• Remembers the right format for each field on each site — the second use is zero-configuration
• Define your own formats (vendor IDs, policy numbers, internal account schemes) with clean-up rules, patterns, and standard checksum algorithms; share them with your team as files
• Submit Guard (beta): optionally block a site's forms from submitting while a field you normally double-check there is unverified
• Keyboard-first: invoke, verify, and attest without touching the mouse

PRIVACY IS THE ARCHITECTURE, NOT A POLICY

Double Check has no access to any page until you invoke it there — it requests no standing permission to read websites. Verified values are never transmitted, logged, or stored. OCR and speech recognition run entirely on your device. There are no analytics and no telemetry. The only network traffic is license verification with our payment provider.

PRICING

7-day free trial with full features — no card required to start. Then $4.99/month, $39/year, or a $99 one-time lifetime license. Core double-entry checking keeps working even without an active subscription, because a safety check should never be held hostage.

WHO IT'S FOR

Accountants and bookkeepers entering wire details. Accounts-payable and treasury teams. Payroll. Paralegals filing with exact case numbers. Crypto users pasting addresses. Anyone who has ever stared at a routing number, looked away, looked back, and wished someone would check it with them.

Double Check assists verification; responsibility for submitted values remains yours. It's the second pair of eyes — you're still the first.

## Privacy practices tab — paste-ready

**Single purpose description:** Helps users verify high-stakes values
(account numbers, routing numbers, amounts, IDs) entered into web forms —
locally on their device, with checksum validation and double-entry
comparison.

**activeTab:** Lets the user open the verification card on the page they
are viewing, only at the moment they invoke the extension via the keyboard
shortcut, the right-click menu, or the toolbar button. The extension has no
standing access to any website.

**scripting:** Injects the verification card's content script into the
active tab when — and only when — the user invokes the extension. Used
together with activeTab; no content scripts run on user pages otherwise.

**Host permission use (https://extensionpay.com/*):** A content script on
extensionpay.com (our payment provider) relays payment and trial
confirmations back to the extension after checkout. This is the only host
permission; the extension requests no access to any other website.

**storage:** Stores the user's settings, their user-defined format
validators, per-site format preferences, and a verification audit log
containing metadata only (time, site, field label, format, outcome). The
verified values themselves are never stored.

**offscreen:** Runs the bundled Tesseract OCR engine in an offscreen
document so that images the user scans or pastes are read entirely
on-device and never uploaded.

**alarms:** A daily alarm deletes audit-log entries older than the user's
chosen retention period.

**contextMenus:** Adds a right-click "Double-check this field" item on
editable fields, as an alternative to the keyboard shortcut and toolbar
button for invoking the extension.

**Remote code:** No. (If text is demanded: All code ships inside the
extension package, including the bundled OCR engine (WASM). The extension
loads no scripts from the network and uses no eval. Its only network
traffic is license verification with ExtensionPay.)

**Data usage disclosures:** tick "Personally identifiable information"
(checkout email, handled by ExtensionPay/Stripe for licensing) and
"Financial and payment information" (payment status via the payment
provider; card details never seen by the extension; verified values are
processed locally and never transmitted or stored). Certify all three
program-policy statements.

**Settings page:** publisher contact email tmh@possibility.com — must be
entered AND verified (click the link in Google's email) before publishing.

## Category

Productivity → Workflow & Planning

## Listing URLs

- Homepage URL: https://doublecheck.possibility.com/
- Support URL: https://doublecheck.possibility.com/support.html
- Privacy policy URL: https://doublecheck.possibility.com/privacy.html
  (the older github.com/…/blob/main/*.md URLs keep working; the extension
  links to those and they remain canonical. toddhoff.github.io redirects
  to the custom domain.)

After the listing is public: replace CHROME_STORE_URL_TODO in the site's
index.html (two places) with the real store URL. For the verified-publisher
badge: verify possibility.com (or the subdomain) in Google Search Console,
then set the verified site in the CWS dashboard account settings.
