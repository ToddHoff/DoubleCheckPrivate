import type { LicenseStatus } from '../shared/types'

export {}

const app = document.getElementById('app')!

app.innerHTML = `
  <button class="primary" id="check">Check focused field</button>
  <p class="hint">Tip: focus the field on the page, then press the keyboard
  shortcut (<a href="#" id="shortcuts">change it</a>).</p>
  <div id="license" class="hint"></div>
  <p class="links"><a href="#" id="options">Settings &amp; log</a> · <a href="#" id="welcome">Welcome &amp; practice page</a></p>
`

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
      link('Upgrade', 'pay-yearly'))
  } else {
    el.append(link('Start free trial', 'trial'), ' · ', link('Buy', 'pay-yearly'), ' · ',
      link('already paid?', 'login'))
  }
})
