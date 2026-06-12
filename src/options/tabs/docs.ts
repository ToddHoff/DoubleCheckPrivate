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
      <kbd>Ctrl+Shift+Space</kbd> elsewhere.</li>
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

<h2>Empty fields (input mode)</h2>
<p>If the field is empty, Double Check helps you enter the value safely: type
it once from the source, then re-type it blind. Only a matching pair is
written into the field.</p>

<h2>Comparing against an image</h2>
<p>Use <em>Scan screen region</em> to drag a box around the value (a PDF open
in another tab, a web page, anything visible), or <em>Paste image</em>
(⌘V/Ctrl+V) for screenshots and phone photos. Recognition runs entirely on
your machine. Anything the OCR finds that passes format validation is offered
as a candidate; values that look close but fail validation are shown as
warnings, never silently used.</p>

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
<p>Flip it on for the site you're on from the toolbar popup — click the
Double Check icon and tick <em>Submit Guard</em>. While it's on, forms on
that site won't submit while a field you normally double-check there is
unverified or was edited after checking. Its limits, honestly: it arms when
Double Check is active on the page (enabling it from the popup arms the
current page immediately), and some single-page apps submit in ways no
extension can intercept — the attestation, not the guard, is the real
control.</p>

<h2>What the log proves (and doesn't)</h2>
<p>Each entry records when and where a check happened, the field, the format,
the methods used, the outcome, and that you personally attested it. It does
not record the value. It is evidence of diligence — that the verification
happened — not a guarantee the value was objectively correct.</p>

<h2>Custom formats</h2>
<p>The Formats tab lets you define your own: clean-up steps, a pattern, a
length range, digit grouping, and a checksum chosen from a menu of standard
algorithms (Luhn, mod-97, Damm, Verhoeff, weighted modulus…). Formats are
data, not code — importing a colleague's format file can't do anything except
validate values.</p>

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

<h2>Policies</h2>
<p>The hosted, canonical copies of our policies:
<a href="https://github.com/ToddHoff/DoubleCheckPublic/blob/main/privacy-policy.md" target="_blank" rel="noopener">privacy policy</a>
·
<a href="https://github.com/ToddHoff/DoubleCheckPublic/blob/main/terms.md" target="_blank" rel="noopener">terms of service</a>.
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
  const docs = h('section', { class: 'panel docs' })
  docs.innerHTML = DOCS_HTML
  rootEl.append(docs)
}
