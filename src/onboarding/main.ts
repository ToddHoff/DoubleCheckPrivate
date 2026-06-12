import { BUILTIN_VALIDATORS, suggestFormats } from '../engine'
import { mountCard } from '../content/card'
import { fieldSignals } from '../content/field'
import { h } from '../shared/dom'
import { getShortcut } from '../shared/shortcut'
import { getSettings } from '../shared/storage'

const app = document.getElementById('app')!
const shell = h('div', { class: 'shell' })
app.appendChild(shell)

// step 1+2: what it is, the privacy promise
shell.append(
  h('div', { class: 'hero' },
    h('div', { class: 'logo' }, '✓✓'),
    h('h1', {}, 'Double Check'),
    h('p', {}, 'A second pair of eyes for the numbers that can’t be wrong.'),
  ),
  h('section', { class: 'step' },
    h('h2', {}, h('span', { class: 'num' }, '1'), 'What it does'),
    h('p', {},
      'When you type a critical value — an account number, a routing number, a wire amount — ' +
      'Double Check has you verify it against your source with a second, independent reading. ' +
      'Formats with built-in check digits (routing numbers, IBANs, card numbers…) are also verified mathematically, ' +
      'so a single wrong digit is usually caught before you even re-type.'),
  ),
  h('section', { class: 'step promise' },
    h('h2', {}, h('span', { class: 'num' }, '2'), 'Your values never leave this computer'),
    h('p', {},
      'No value you verify is ever transmitted, logged, or stored. No analytics, no telemetry. ' +
      'Reading aloud uses your device’s local voice; image scanning runs a bundled, offline OCR engine. ' +
      'The extension can’t even see a page until you invoke it there — it has no standing access to any website. ' +
      'The only network traffic is license checking (your email and payment status, nothing else).'),
    h('p', {},
      h('a', { href: 'https://github.com/ToddHoff/DoubleCheckPublic/blob/main/privacy-policy.md', target: '_blank', rel: 'noopener' }, 'Full privacy policy'),
      ' · ',
      h('a', { href: 'https://github.com/ToddHoff/DoubleCheckPublic/blob/main/terms.md', target: '_blank', rel: 'noopener' }, 'Terms of service'),
    ),
  ),
)

// feature tour — everything it can do, at a glance
function feat(title: string, body: string, tag?: string): HTMLElement {
  const heading = h('h3', {}, title)
  if (tag) heading.append(h('span', { class: 'tag' }, tag))
  return h('div', { class: 'feat' }, heading, h('p', {}, body))
}

shell.append(
  h('section', { class: 'features' },
    h('h2', {}, 'Everything Double Check can do'),
    h('p', {}, 'One keyboard shortcut on any field opens all of this.'),
    h('div', { class: 'fgrid' },
      feat('Real checksum math, not just patterns',
        '23 built-in formats. Routing numbers, IBANs, card numbers, CLABE, CUSIP, ISIN, VINs, and crypto ' +
        'addresses carry internal check digits — Double Check computes them, so a single wrong digit is often ' +
        'caught before you re-type anything.'),
      feat('Blind double entry',
        'Re-type the value from your source — not from the field. Two independent readings must agree before ' +
        'anything is confirmed. Empty fields get a safe two-step entry flow.'),
      feat('Mismatches explained, not just flagged',
        'A red result names the error: “characters 5 and 6 appear swapped,” one wrong digit, a missing or ' +
        'extra character — with a character-level diff. Transposition is the classic transcription error, ' +
        'and it gets called out by name.'),
      feat('Amounts taken seriously',
        'US and European separators both parse; genuinely ambiguous amounts like “1,234” are refused rather ' +
        'than guessed. Matches confirm in words: 1,200,000.00 — one million two hundred thousand and 00/100.'),
      feat('Compare against an image',
        'Scan a screen region or paste a screenshot or phone photo. A bundled OCR engine reads it on your ' +
        'device — images are never uploaded — and common misreads like O-for-0 are repaired automatically.'),
      feat('Speak it',
        'Read the value aloud from the paper in your hand; Chrome’s on-device speech recognition transcribes ' +
        'it (nothing leaves the machine) and it’s validated like any other entry.', 'Chrome 139+'),
      feat('Hear it read back',
        'A speaker button reads the value digit by digit with grouping pauses, using a local on-device voice ' +
        'only, at the speed you choose — read along on your source.'),
      feat('A badge that stays honest',
        'Verified fields get a “Double-Checked” badge. If the value changes afterwards — any reason, any ' +
        'keystroke — the badge flips to a warning and the log entry is marked stale.'),
      feat('Proof without the value',
        'Every attested check is logged: when, where, what format, which methods, and your attestation. ' +
        'Never the value itself. Export CSV/JSON for your records; retention is yours to set.'),
      feat('It remembers each site',
        'Confirm that a field is an IBAN once, and the right format is preselected on that site forever ' +
        'after. Second use is zero-configuration.'),
      feat('Your own formats',
        'Vendor IDs, policy numbers, internal account schemes — define them with clean-up rules, patterns, ' +
        'lengths, and a menu of checksum algorithms. Formats are data, never code, and they export as files ' +
        'your whole team can import.'),
      feat('Submit Guard',
        'A toggle at the bottom of the check card, naming the site you’re on. Forms there won’t submit ' +
        'while a field you normally double-check is unverified or was edited after checking. A seatbelt ' +
        'on top of the workflow, honest about its limits.', 'beta'),
    ),
  ),
)

// step 3: practice form
const practiceField = h('input', {
  id: 'practice', name: 'routing_number', inputmode: 'numeric', autocomplete: 'off',
}) as HTMLInputElement
const shortcutLabel = h('kbd', {}, '…')
const shortcutSpelled = h('span', {})
const tryBtn = h('button', { class: 'btn primary' }, 'Open Double Check on this field')
const practiceStatus = h('p', { class: 'muted' })

shell.append(
  h('section', { class: 'step practice' },
    h('h2', {}, h('span', { class: 'num' }, '3'), 'Try it — safely'),
    h('p', {}, h('strong', {}, 'Three ways to open Double Check on any field:')),
    h('ul', {},
      h('li', {}, 'Keyboard: click into the field and press ', shortcutLabel, shortcutSpelled, '.'),
      h('li', {}, 'Right-click: right-click the field and choose ', h('em', {}, '“Double-check this field”'), '.'),
      h('li', {},
        'Toolbar: click into the field, then click the green Double Check icon and choose ',
        h('em', {}, '“Check focused field”'),
        '. Chrome hides new extensions at first — click the puzzle-piece menu at the right end of the ' +
        'toolbar, find Double Check, and click the pin so the icon stays visible.'),
    ),
    h('p', {}, 'This is a fake wire-transfer field. Your “source document” says the routing number is:'),
    h('div', { class: 'source' }, '021 000 021'),
    h('label', { for: 'practice' }, 'Routing number'),
    practiceField,
    h('p', {}, 'Open Double Check on the field using either way above — or the button below. ' +
      'Type the number (try getting one digit wrong on purpose to see the red diff).'),
    h('div', { class: 'demo-note' },
      h('strong', {}, 'Heads up — this practice page is slightly hobbled. '),
      'It’s one of the extension’s own pages, and Chrome restricts a couple of things here that work ' +
      'normally everywhere else: “Scan screen region” isn’t available on this page (use Paste image or ' +
      'Speak it instead), and the microphone needs a one-time grant via the voice setup rather than a ' +
      'simple prompt. On real websites — where you’ll actually use Double Check — scanning works, the mic ' +
      'asks once per site, and the shortcut is handled natively by Chrome. Everything else you see here ' +
      '(checksums, blind double entry, the red diff, the badge, the log) is exactly the real product.'),
    h('div', {}, tryBtn),
    practiceStatus,
  ),
  h('section', { class: 'step' },
    h('h2', {}, h('span', { class: 'num' }, '4'), 'Day-to-day'),
    h('ul', {},
      h('li', {}, 'Focus the field → shortcut → confirm the format → re-type from your source → attest.'),
      h('li', {}, 'Empty field? Double Check helps you enter the value with a blind second entry.'),
      h('li', {}, 'Compare against an image: scan a screen region or paste a screenshot — recognized locally.'),
      h('li', {}, 'Every attested check is logged (never the value) — see the Log tab in Settings.'),
    ),
    (() => {
      const open = h('button', { class: 'btn' }, 'Open Settings & docs')
      open.addEventListener('click', () => void chrome.runtime.openOptionsPage())
      return h('div', {}, open)
    })(),
  ),
  h('section', { class: 'step' },
    h('h2', {}, h('span', { class: 'num' }, '5'), 'Start your free trial'),
    h('p', {},
      '7 days, full features, no card required to try. After that it’s a small subscription — ' +
      'core double-entry checking keeps working either way.'),
    (() => {
      const trial = h('button', { class: 'btn primary' }, 'Start 7-day free trial')
      trial.addEventListener('click', () =>
        void chrome.runtime.sendMessage({ kind: 'dc-payment-action', action: 'trial' }))
      const login = h('button', { class: 'btn' }, 'I already have a license')
      login.addEventListener('click', () =>
        void chrome.runtime.sendMessage({ kind: 'dc-payment-action', action: 'login' }))
      return h('div', { style: 'display:flex;gap:10px' }, trial, login)
    })(),
  ),
)

// troubleshooting — every issue is one users have actually hit
function trouble(question: string, ...answers: string[]): HTMLElement {
  return h('details', {}, h('summary', {}, question), ...answers.map((a) => {
    const p = h('p', {})
    p.innerHTML = a
    return p
  }))
}

shell.append(
  h('section', { class: 'trouble' },
    h('h2', {}, 'Troubleshooting'),
    trouble('The keyboard shortcut does nothing',
      'Check it’s actually bound: <code>chrome://extensions/shortcuts</code> — Chrome silently leaves it blank if another extension claimed the combo. On a Mac, also make sure macOS itself doesn’t own it (System Settings → Keyboard → Keyboard Shortcuts).',
      'The shortcut can’t work on Chrome’s own pages (<code>chrome://…</code>, the Web Store) — use the toolbar button there. For files opened from disk, enable “Allow access to file URLs” on the extension’s card in <code>chrome://extensions</code>.'),
    trouble('I updated the extension and something behaves oddly or looks stale',
      'Updates need two reloads: the ↻ refresh arrow on the extension’s card in <code>chrome://extensions</code>, and then close and reopen any tabs that were already open — including this page. A page keeps running the code it loaded originally.'),
    trouble('There’s no Compare button',
      'An empty field opens in input mode, which is two steps: step 1 enters the value, step 2 re-types it blind — Compare appears in step 2. A field that already has a value opens in verify mode with Compare on the first screen.'),
    trouble('The field turned blue, not green',
      'Blue in step 1 means “the format looks right” — the value isn’t confirmed yet. Green is reserved for an actual match between your two independent entries.'),
    trouble('“Microphone access is blocked” when I use Speak it',
      'Chrome’s microphone prompt names the website you’re on — that’s how browsers attribute extension features running in a page. Allow it once per site; if it was dismissed or blocked, click the mic icon in the address bar or check <code>chrome://settings/content/microphone</code>.',
      'On a Mac, also confirm Chrome itself is allowed under System Settings → Privacy &amp; Security → Microphone. To skip the one-time model download mid-check, run the voice setup from Settings → How it works → Voice input.'),
    trouble('It’s listening but says it didn’t hear anything',
      'Chrome is probably listening to a different microphone than the one you’re speaking into — common with Bluetooth earbuds. Check System Settings → Sound → Input (does the level meter move when you speak?) and Chrome’s own device choice at the top of <code>chrome://settings/content/microphone</code>.',
      'Also: start reading the digits as soon as “Listening” appears — it gives up after a few seconds of silence. Quickest isolation test: take the earbuds out and speak at the computer directly.'),
    trouble('“Couldn’t capture this page” when scanning a screen region',
      'Screen scanning uses the one-time page access Chrome grants when you open Double Check with the shortcut or the toolbar button. If the card was opened another way (like the practice button on this page), there’s no grant — re-open it with the shortcut, or paste a screenshot instead (⌘V / Ctrl+V works anywhere).'),
    trouble('The read-aloud speaker button is missing',
      'It appears in verify mode and on the green match screen — not during blind entry, where hearing the value would defeat the purpose. If it’s disabled with a “no local voice” note, your device has no on-device voice; network voices are deliberately never used.'),
  ),
)

// show the user's actual shortcut binding, spelled out when it uses symbols
void getShortcut('check-field').then((sc) => {
  if (!sc) {
    shortcutLabel.textContent = 'the shortcut (unassigned — set one at chrome://extensions/shortcuts)'
    return
  }
  shortcutLabel.textContent = sc.display
  if (sc.spelled) shortcutSpelled.textContent = ` (that’s ${sc.spelled})`
})

async function openCardOnPractice(): Promise<void> {
  practiceField.focus()
  const settings = await getSettings()
  mountCard(practiceField, {
    validators: BUILTIN_VALIDATORS,
    suggestions: suggestFormats(fieldSignals(practiceField), BUILTIN_VALIDATORS),
    settings,
    license: { active: true, trial: false, trialDaysLeft: -1, cached: false },
  })
  practiceStatus.textContent = ''
}

tryBtn.addEventListener('click', () => void openCardOnPractice())

// the real keyboard shortcut also works here: the background can't inject
// into extension pages, so we listen for the bound combo locally.
// Why the odd parsing: chrome.commands.getAll() returns a DISPLAY string —
// "⇧⌘Space" on macOS (symbols, no separators), "Ctrl+Shift+Space" elsewhere.
void chrome.commands.getAll().then((commands) => {
  const raw = commands.find((c) => c.name === 'check-field')?.shortcut
  if (!raw) return
  const wantShift = raw.includes('⇧') || raw.includes('Shift')
  const wantMeta = raw.includes('⌘') || raw.includes('Command') || raw.includes('Search')
  const wantCtrl = raw.includes('⌃') || /(?:^|\+)Ctrl(?:\+|$)/.test(raw)
  const wantAlt = raw.includes('⌥') || raw.includes('Alt')
  const key = raw
    .replace(/[⇧⌘⌃⌥]/g, '')
    .split('+')
    .map((s) => s.trim())
    .filter((s) => s && !['Ctrl', 'Shift', 'Alt', 'Command', 'MacCtrl', 'Search'].includes(s))
    .pop()
    ?.toLowerCase()
  if (!key) return
  document.addEventListener('keydown', (e) => {
    const keyMatch = key === 'space' ? e.code === 'Space' : e.key.toLowerCase() === key
    if (keyMatch && e.shiftKey === wantShift && e.altKey === wantAlt &&
        e.metaKey === wantMeta && e.ctrlKey === wantCtrl) {
      e.preventDefault()
      void openCardOnPractice()
    }
  })
})
