import { getShortcut } from '../shared/shortcut'
import { getStats } from '../shared/storage'
import type { LicenseStatus } from '../shared/types'

export {}

const app = document.getElementById('app')!

app.innerHTML = `
  <div id="iframefield" hidden></div>
  <button class="primary" id="check">Check focused field</button>
  <p class="hint">Tip: focus the field on the page, then press
  <span id="kbd">the keyboard shortcut</span> (<a href="#" id="shortcuts">change it</a>).</p>
  <div id="license" class="hint"></div>
  <p class="wins" id="wins" hidden></p>
  <p class="links"><a href="#" id="options">Settings &amp; log</a> · <a href="#" id="help">Help</a></p>
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

// Solution B: detect when the focused field is sealed inside a cross-origin
// frame (a card number in a payment iframe). The grant must come from this
// extension page — content scripts can't call permissions.request.
type IframeField = { origin: string; host: string; isCard: boolean }

function detectIframeField(): IframeField | null {
  const re = /cc|card|credit|number|payment|cvv|cvc|secur|stripe|braintree|adyen|checkout|safeweb/i
  const consider = (f: HTMLIFrameElement): IframeField | null => {
    let crossOrigin = false
    try { crossOrigin = !f.contentDocument } catch { crossOrigin = true }
    if (!crossOrigin || !f.src) return null
    try {
      const u = new URL(f.src)
      const hint = `${f.id} ${f.name} ${f.title} ${f.src}`.toLowerCase()
      return { origin: u.origin, host: u.host, isCard: re.test(hint) }
    } catch {
      return null
    }
  }
  // prefer the focused iframe (any cross-origin frame the user is in)
  const ae = document.activeElement
  if (ae && ae.tagName === 'IFRAME') {
    const r = consider(ae as HTMLIFrameElement)
    if (r) return r
  }
  // otherwise look for a payment-looking cross-origin iframe on the page, so the
  // grant button still shows after a scan pill sent the user to the toolbar
  for (const f of Array.from(document.querySelectorAll('iframe'))) {
    const r = consider(f as HTMLIFrameElement)
    if (r?.isCard) return r
  }
  return null
}

void (async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  let detected: IframeField | null = null
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: detectIframeField })
    detected = (res?.result as IframeField | null) ?? null
  } catch {
    return // restricted page (chrome://, web store) — can't inspect
  }
  if (!detected) return

  const origins = [`${detected.origin}/*`]
  const granted = await chrome.permissions.contains({ origins })
  const label = detected.isCard ? 'card field' : 'field'
  const box = document.getElementById('iframefield')!
  box.hidden = false

  const verify = async () => {
    await chrome.runtime.sendMessage({ kind: 'dc-verify-iframe', tabId: tab.id })
    window.close()
  }

  const btn = document.createElement('button')
  btn.className = 'primary'
  btn.textContent = `Verify the ${label} on ${detected.host}`
  const note = document.createElement('p')
  note.className = 'hint'
  box.append(btn, note)

  if (granted) {
    note.textContent = 'This field is inside a secure frame — access already granted.'
    btn.addEventListener('click', () => void verify())
  } else {
    note.textContent = `It's inside a secure frame. You'll be asked once to allow Double Check on ${detected.host}.`
    btn.addEventListener('click', async () => {
      // must be the first await in the gesture so the user-activation survives
      const ok = await chrome.permissions.request({ origins })
      if (ok) await verify()
    })
  }
})()

document.getElementById('options')!.addEventListener('click', (e) => {
  e.preventDefault()
  void chrome.runtime.openOptionsPage()
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
