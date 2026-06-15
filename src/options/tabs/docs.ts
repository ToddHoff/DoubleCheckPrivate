import { h } from '../../shared/dom'

const DOCS_HTML = `
<p><a href="../onboarding/index.html" target="_blank" rel="noopener">
Open the welcome &amp; practice page</a> — a safe fake wire-transfer form to
try everything on.</p>

<div class="note">
  <strong>The privacy promise.</strong> The values you verify never leave this
  computer. They are never transmitted, never logged, never stored — not even
  hashed, unless you explicitly turn on fingerprinting. There are no analytics
  and no telemetry. The extension's only network traffic is license checking
  with ExtensionPay (which sees your email and payment status, nothing else).
  Reading values aloud uses your device's local voice. OCR runs a bundled,
  offline copy of Tesseract — images are never uploaded. The extension has no
  permission to read any page until you press the shortcut on it.
</div>

<h2>How a check works</h2>
<ol>
  <li>Click into the field that holds (or will hold) the critical value.</li>
  <li>Press the shortcut — <kbd>Shift+Command+Space</kbd> on a Mac (Chrome
      shows it as <kbd>⇧⌘Space</kbd>; ⇧ is the Shift key, ⌘ is Command),
      <kbd>Ctrl+Shift+Space</kbd> elsewhere. Or right-click the field and
      choose <em>Double-check this field</em>, or use the toolbar icon.</li>
  <li>Confirm the detected format, or pick one. Formats with real checksums
      (routing numbers, IBANs, cards…) are verified mathematically on the
      spot — a wrong digit often turns the card red before you do anything.</li>
  <li><strong>Re-type the value from your source</strong> — the paper, PDF,
      email, or phone screen — not from the field. That's the whole point:
      two independent readings of the source must agree.</li>
  <li>Green means match. Red shows exactly what differs — swapped digits are
      called out by name, since transposition is the classic transcription
      error.</li>
  <li>Tick the attestation, and the check is logged (without the value).
      A badge marks the field, and if the value changes afterwards the badge
      flips to a warning and the log entry is marked stale.</li>
</ol>

<h2>Not sure which fields to check?</h2>
<p>Right-click anywhere on a page and choose <em>Find fields to
double-check</em>. Double Check scans the page and tags the high-value fields
— account and routing numbers, IBANs, card numbers, SSNs, amounts, and the
like — with a clickable pill. Click a pill to open the card on that field, or
press Esc to dismiss. The scan reads field labels and types only, never the
values, and runs entirely on your device.</p>

<h2>Trusted accounts (catching “our bank details changed” fraud)</h2>
<p>On a green match, you can name the payee. Double Check remembers that
account for that payee — storing a one-way fingerprint, never the value. The
next time you verify a value for a saved payee, it confirms <em>“matches the
account you saved for Acme,”</em> or warns <em>“this is NOT the account you
saved for Acme”</em> if it differs. That last warning is the one a checksum
can't give you — it's how a fraudulent “we changed banks” request gets
caught. Manage or delete saved accounts in the Trusted accounts tab. Nothing is
fingerprinted unless you name a payee, and the key never leaves your
device.</p>

<h2>Audit a whole page</h2>
<p>Right-click anywhere on a page and choose <em>Check this page for
problems</em>. Double Check inspects every field that already has a value and
flags the ones with a detectable problem — a failed checksum, an invalid
country code, or a hidden/look-alike character — with a red note you can
dismiss (or press Esc). Click a note to open the card on that field and fix
it. Empty fields are left alone; the audit reads values locally and never
transmits them.</p>

<h2>Empty fields (input mode)</h2>
<p>If the field is empty, Double Check helps you enter the value safely: type
it once from the source, then re-type it blind. Only a matching pair is
written into the field.</p>

<h2>Comparing against an image</h2>
<p>Press <em>Paste image</em> and paste a screenshot or phone photo of the
value — from another tab, a PDF, an email, anywhere. Copy it to the clipboard
first (Mac: Shift+Control+Command+4 to grab a region; Windows: Win+Shift+S),
then ⌘V / Ctrl+V. Recognition runs entirely on your machine. Anything the OCR
finds that passes format validation is offered as a candidate; values that
look close but fail validation are shown as warnings, never silently used.</p>

<h2>Voice input</h2>
<p><em>Speak it</em> lets you read the value aloud from your source —
digit by digit works best. Recognition uses Chrome's on-device speech model
(Chrome 139+); your audio and transcript never leave the machine, and if
on-device recognition isn't available the feature disables itself — it never
falls back to a cloud service. Chrome's microphone prompt names the website
you're on (that's how browsers attribute extension features running in a
page); allow it once per site. You can
<a href="../mic/index.html" target="_blank" rel="noopener">pre-download the
speech model here</a> so the first use doesn't wait on it.</p>

<h2>Submit Guard (beta)</h2>
<p>The check card has a <em>Submit Guard</em> toggle at the bottom, naming
the site you're on — tick it while checking a field there. While it's on,
forms on that site won't submit while a field you normally double-check is
unverified or was edited after checking. Its limits, honestly: it arms when
Double Check is active on the page (the toggle arms the current page
immediately), and some single-page apps submit in ways no extension can
intercept — the attestation, not the guard, is the real control.</p>

<h2>Two signatures (for the highest-stakes fields)</h2>
<p>When one person signing off isn't enough, tick <em>Require two signatures
for this field</em> on the check card (just above Submit Guard). That choice is
remembered for this field on this site. The attestation then reads
"<em>We</em> have personally compared…", and both people type their name —
the check can't be confirmed until both names are filled in and differ. Both
names are saved with the log entry, locally, like everything else.</p>

<h2>The tamper-evident seal</h2>
<p>Every log entry is sealed with a keyed hash chained to the entry before it,
using a random key generated on your device that never leaves it. The
<em>Verify integrity</em> button on the Log tab recomputes the chain and tells
you whether any entry was edited, removed, reordered, or inserted since it was
written. Honest limits: the seal shows the log hasn't been altered <em>on this
device</em>. It is not identity authentication, and because the key lives on the
same device, it is not proof against the device's owner, nor a substitute for a
court-admissible record.</p>

<h2>Notes</h2>
<p>Each check has an optional <em>Note</em> field on the card — for recording
where a value came from or how it was calculated (e.g. "from the signed PO,
page 2"). The note is saved with the log entry and sealed along with it.
Keep the value itself out of the note: the whole point is that the value is
never stored.</p>

<h2>What it has caught</h2>
<p>The Settings tab keeps a running, local-only tally of what Double Check has
actually caught for you — mismatches, bad values, account-change warnings, and
problems found by a page audit — and the popup shows the total. These are
counts of real events that happened on this device; they are never an estimate
of money "saved", and like everything else they are never transmitted.</p>

<h2>What the log proves (and doesn't)</h2>
<p>Each entry records when and where a check happened, the field, the format,
the methods used, the outcome, and that you personally attested it (and, when
the field requires it, who signed). It does not record the value. It is
evidence of diligence — that the verification happened — not a guarantee the
value was objectively correct.</p>

<h2>Custom formats</h2>
<p>The Formats tab lets you define your own: clean-up steps, a pattern, a
length range, digit grouping, and a checksum chosen from a menu of standard
algorithms (Luhn, mod-97, Damm, Verhoeff, weighted modulus…). Formats are
data, not code — importing a colleague's format file can't do anything except
validate values.</p>
<p>A format can also carry an optional <em>amount range</em>. When a value
parses as an amount and falls outside the expected min/max, Double Check shows
a soft warning (it never blocks) — a simple, company-specific way to flag an
unusually large wire or payment for a field. Because the bounds are your own
configuration, this works without storing any past values.</p>

<h2>Known limits — read this once</h2>
<ul>
  <li><strong>US bank account numbers have no public checksum.</strong> For
      those, double entry is the only real check; the card says so.</li>
  <li>Double Check can't see Chrome system pages, the Web Store, or PDFs
      opened in Chrome's built-in viewer. For those, use <em>Paste image</em>
      with a screenshot.</li>
  <li>Cross-origin iframes may be unreachable without broader permissions —
      which this extension deliberately does not request.</li>
  <li>A verified badge means the value matched your two readings at that
      moment. The tamper watch covers later edits to the field, but the final
      look before you click Submit is still yours.</li>
</ul>

<h2>Policies &amp; support</h2>
<p>The hosted, canonical copies of our policies:
<a href="https://github.com/ToddHoff/DoubleCheckPublic/blob/main/privacy-policy.md" target="_blank" rel="noopener">privacy policy</a>
·
<a href="https://github.com/ToddHoff/DoubleCheckPublic/blob/main/terms.md" target="_blank" rel="noopener">terms of service</a>
·
<a href="https://github.com/ToddHoff/DoubleCheckPublic/blob/main/support.md" target="_blank" rel="noopener">support</a>.
When reporting a problem, never include the actual values you were verifying.
</p>

<h2>Responsibility</h2>
<p>Double Check is an assistive tool. It helps you verify; it does not and
cannot guarantee correctness, and it accepts no liability for the outcome of
any transaction. The attestation you tick says exactly that: the
responsibility for the value remains yours. If a value moves money, look at
it one more time before you submit. That's not legal boilerplate — it's how
the tool is meant to be used.</p>
`

export function renderDocsTab(rootEl: HTMLElement): void {
  const img = (file: string) => chrome.runtime.getURL(`screenshots/${file}`)
  const walkthrough = `
<h2>See it in action</h2>
<div class="docwalk">
  <figure><img src="${img('doc-verify.jpg')}" alt="The card on a routing field: checksum valid, with a re-type box">
    <figcaption><strong>1.</strong> Press the shortcut on a field — Double Check detects the format,
    verifies the math, and asks you to re-type the value from your source.</figcaption></figure>
  <figure><img src="${img('doc-mismatch.jpg')}" alt="A mismatch naming two swapped digits">
    <figcaption><strong>2.</strong> If your two readings disagree, it names the exact error —
    here, two digits transposed.</figcaption></figure>
  <figure><img src="${img('doc-match.jpg')}" alt="A green match confirming an amount in words">
    <figcaption><strong>3.</strong> A match turns green and confirms amounts in words.</figcaption></figure>
  <figure><img src="${img('doc-trusted.jpg')}" alt="A warning that this is not the account saved for the payee">
    <figcaption><strong>4.</strong> Name the payee and it warns when an account differs from the one
    you saved before — the “bank details changed” fraud catch.</figcaption></figure>
</div>
<figure class="docwide"><img src="${img('doc-scan.jpg')}" alt="A page with high-value fields tagged">
  <figcaption>Or right-click a page to flag every high-value field at once.</figcaption></figure>
`
  const docs = h('section', { class: 'panel docs' })
  docs.innerHTML = DOCS_HTML.replace('<h2>How a check works</h2>', walkthrough + '<h2>How a check works</h2>')
  rootEl.append(docs)
}
