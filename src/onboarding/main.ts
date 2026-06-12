import { BUILTIN_VALIDATORS, suggestFormats } from '../engine'
import { mountCard } from '../content/card'
import { fieldSignals } from '../content/field'
import { h } from '../shared/dom'
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

// step 3: practice form
const practiceField = h('input', {
  id: 'practice', name: 'routing_number', inputmode: 'numeric', autocomplete: 'off',
}) as HTMLInputElement
const shortcutLabel = h('kbd', {}, '…')
const tryBtn = h('button', { class: 'btn primary' }, 'Open Double Check on this field')
const practiceStatus = h('p', { class: 'muted' })

shell.append(
  h('section', { class: 'step practice' },
    h('h2', {}, h('span', { class: 'num' }, '3'), 'Try it — safely'),
    h('p', {}, 'This is a fake wire-transfer field. Your “source document” says the routing number is:'),
    h('div', { class: 'source' }, '021 000 021'),
    h('label', { for: 'practice' }, 'Routing number'),
    practiceField,
    h('p', {}, 'Click into the field, then press ', shortcutLabel, ' — or use the button. ',
      'Type the number (try getting one digit wrong on purpose to see the red diff).'),
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

// show the user's actual shortcut binding
void chrome.commands.getAll().then((commands) => {
  const cmd = commands.find((c) => c.name === 'check-field')
  shortcutLabel.textContent = cmd?.shortcut || 'the shortcut (unassigned — set one at chrome://extensions/shortcuts)'
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
// into extension pages, so we listen for the bound combo locally
void chrome.commands.getAll().then((commands) => {
  const shortcut = commands.find((c) => c.name === 'check-field')?.shortcut
  if (!shortcut) return
  const parts = shortcut.split('+')
  const key = parts[parts.length - 1].toLowerCase()
  document.addEventListener('keydown', (e) => {
    const wantCtrl = parts.includes('Ctrl'), wantCmd = parts.includes('⌘') || parts.includes('Command')
    const wantShift = parts.includes('Shift'), wantAlt = parts.includes('Alt') || parts.includes('⌥')
    const keyMatch = key === 'space' ? e.code === 'Space' : e.key.toLowerCase() === key
    if (keyMatch && e.shiftKey === wantShift && e.altKey === wantAlt &&
        (e.ctrlKey === wantCtrl || e.metaKey === wantCmd) &&
        document.activeElement === practiceField) {
      e.preventDefault()
      void openCardOnPractice()
    }
  })
})
