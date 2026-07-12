import { getShortcut } from '../shared/shortcut'
import { getStats } from '../shared/storage'
import type { LicenseStatus } from '../shared/types'

export {}

const app = document.getElementById('app')!

app.innerHTML = `
  <button class="primary" id="check">Check focused field</button>
  <p class="hint">Tip: focus the field on the page, then press
  <span id="kbd">the keyboard shortcut</span> (<a href="#" id="shortcuts">change it</a>).</p>
  <button id="scan">Find fields to double-check</button>
  <button id="audit">Check this page for problems</button>
  <p class="hint">Scan the whole page: tag the high-value fields worth verifying, or flag any with a problem (failed checksum, wrong country code, look-alike character).</p>
  <div id="license" class="hint"></div>
  <p class="wins" id="wins" hidden></p>
  <p class="links"><a href="#" id="options">Settings &amp; log</a> · <a href="#" id="help">Help</a> · <a href="#" id="community">Community</a></p>
`

// Why: only surface the counter once there's a real win — "0 issues caught"
// reads as a dead feature, not a reassuring one.
void getStats().then((s) => {
  const caught = s.mismatchesCaught + s.badValuesCaught + s.accountChangeWarnings + s.pageProblemsFound
  if (s.checked <= 0 && caught <= 0) return
  const parts: string[] = []
  if (s.checked > 0) parts.push(`${s.checked} value${s.checked === 1 ? '' : 's'} checked`)
  if (caught > 0) parts.push(`${caught} issue${caught === 1 ? '' : 's'} caught`)
  const el = document.getElementById('wins')!
  el.textContent = `✓ ${parts.join(' · ')} so far`
  el.removeAttribute('hidden')
})

void getShortcut('check-field').then((sc) => {
  const el = document.getElementById('kbd')!
  if (!sc) {
    el.textContent = 'the keyboard shortcut — none set'
    return
  }
  el.innerHTML = ''
  const kbd = document.createElement('kbd')
  kbd.textContent = sc.display
  el.append(kbd)
  if (sc.spelled) el.append(` — that’s ${sc.spelled}`)
})

document.getElementById('check')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    await chrome.runtime.sendMessage({ kind: 'dc-activate-from-popup', tabId: tab.id })
    window.close()
  }
})

document.getElementById('scan')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    await chrome.runtime.sendMessage({ kind: 'dc-scan-from-popup', tabId: tab.id })
    window.close()
  }
})

document.getElementById('audit')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    await chrome.runtime.sendMessage({ kind: 'dc-audit-from-popup', tabId: tab.id })
    window.close()
  }
})

document.getElementById('options')!.addEventListener('click', (e) => {
  e.preventDefault()
  void chrome.runtime.openOptionsPage()
})

document.getElementById('community')!.addEventListener('click', (e) => {
  e.preventDefault()
  void chrome.tabs.create({ url: 'https://www.reddit.com/r/DoubleCheck/' })
})

document.getElementById('help')!.addEventListener('click', (e) => {
  e.preventDefault()
  // the Double Check page is the welcome/onboarding page; land on its Help section
  void chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') + '#help' })
})

document.getElementById('shortcuts')!.addEventListener('click', (e) => {
  // chrome:// URLs can't be normal links; open via tabs API
  e.preventDefault()
  void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
})

const payAction = (action: string) => () =>
  void chrome.runtime.sendMessage({ kind: 'dc-payment-action', action }).then(() => window.close())

void chrome.runtime.sendMessage({ kind: 'dc-license-status' }).then((lic: LicenseStatus | undefined) => {
  const el = document.getElementById('license')!
  if (!lic) return
  const link = (text: string, action: string) => {
    const a = document.createElement('a')
    a.href = '#'
    a.textContent = text
    a.addEventListener('click', (e) => {
      e.preventDefault()
      payAction(action)()
    })
    return a
  }
  if (lic.active && !lic.trial) {
    el.append('Licensed', lic.cached ? ' (offline)' : '', ' · ', link('manage subscription', 'manage'))
  } else if (lic.trial) {
    el.append(`Free trial — ${lic.trialDaysLeft} day${lic.trialDaysLeft === 1 ? '' : 's'} left. `,
      link('Upgrade', 'choose-plan'))
  } else {
    el.append(link('Start free trial', 'trial'), ' · ', link('See plans', 'choose-plan'), ' · ',
      link('already paid?', 'login'))
  }
})
