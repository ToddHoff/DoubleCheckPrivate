import { getSettings, saveSettings } from '../shared/storage'
import type { LicenseStatus } from '../shared/types'

export {}

const app = document.getElementById('app')!

app.innerHTML = `
  <button class="primary" id="check">Check focused field</button>
  <p class="hint">Tip: focus the field on the page, then press the keyboard
  shortcut (<a href="#" id="shortcuts">change it</a>).</p>
  <div id="guard"></div>
  <div id="license" class="hint"></div>
  <p class="links"><a href="#" id="options">Settings &amp; log</a> · <a href="#" id="welcome">Welcome &amp; practice page</a></p>
`

// Submit Guard: a per-site toggle for the site you're on right now
void (async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let origin: string | null = null
  try {
    const url = new URL(tab?.url ?? '')
    if (url.protocol === 'http:' || url.protocol === 'https:') origin = url.origin
  } catch {
    /* chrome:// pages etc. — no guard toggle */
  }
  if (!origin || !tab?.id) return
  const tabId = tab.id
  const settings = await getSettings()

  const wrap = document.getElementById('guard')!
  const label = document.createElement('label')
  label.className = 'guard'
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = settings.submitGuardOrigins.includes(origin)
  const text = document.createElement('span')
  text.innerHTML = `<strong>Submit Guard</strong> on ${origin.replace(/^https?:\/\//, '')} <em>(beta)</em><br>
    <small>Blocks form submits here while a field you normally double-check is unverified.</small>`
  label.append(box, text)
  wrap.appendChild(label)

  box.addEventListener('change', async () => {
    settings.submitGuardOrigins = box.checked
      ? [...new Set([...settings.submitGuardOrigins, origin])]
      : settings.submitGuardOrigins.filter((o) => o !== origin)
    await saveSettings(settings)
    if (box.checked) {
      // arm it on this page immediately (popup open = activeTab granted)
      await chrome.runtime.sendMessage({ kind: 'dc-arm-guard', tabId }).catch(() => null)
    } else {
      text.querySelector('small')!.textContent = 'Off — already-armed pages stay guarded until reloaded.'
    }
  })
})()

document.getElementById('check')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    await chrome.runtime.sendMessage({ kind: 'dc-activate-from-popup', tabId: tab.id })
    window.close()
  }
})

document.getElementById('options')!.addEventListener('click', (e) => {
  e.preventDefault()
  void chrome.runtime.openOptionsPage()
})

document.getElementById('welcome')!.addEventListener('click', (e) => {
  e.preventDefault()
  void chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })
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
