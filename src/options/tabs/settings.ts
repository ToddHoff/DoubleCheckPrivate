import { h } from '../../shared/dom'
import { getSettings, getStats, getTosAcceptance, saveSettings, saveTosAcceptance } from '../../shared/storage'
import { STORAGE_KEYS, type LicenseStatus } from '../../shared/types'

function licensePanel(lic: LicenseStatus | null, tosAccepted: boolean): HTMLElement {
  const payBtns: HTMLButtonElement[] = []
  const pay = (label: string, action: string, primary = false) => {
    const b = h('button', { class: primary ? 'btn primary' : 'btn' }, label) as HTMLButtonElement
    b.addEventListener('click', () => void chrome.runtime.sendMessage({ kind: 'dc-payment-action', action }))
    // trials/purchases require ToS acceptance; manage/login don't
    if (action !== 'manage' && action !== 'login') payBtns.push(b)
    return b
  }
  const panel = h('section', { class: 'panel' }, h('h2', {}, 'License'))
  if (!lic) {
    panel.append(h('p', { class: 'muted' }, 'License status unavailable.'))
  } else if (lic.active && !lic.trial) {
    panel.append(
      h('p', {}, `Licensed${lic.cached ? ' (verified offline from cache)' : ''}. Thank you!`),
      h('div', { class: 'btnrow' }, pay('Manage subscription', 'manage')),
    )
  } else if (lic.trial) {
    panel.append(
      h('p', {}, `Free trial — ${lic.trialDaysLeft} day${lic.trialDaysLeft === 1 ? '' : 's'} left.`),
      h('div', { class: 'btnrow' },
        pay('Upgrade — yearly (best value)', 'pay-yearly', true), pay('Monthly', 'pay-monthly'),
        pay('Lifetime — pay once', 'pay-lifetime')),
    )
  } else {
    panel.append(
      h('p', {}, 'No active license. Core double-entry checking keeps working; image compare and custom formats need a plan.'),
      h('div', { class: 'btnrow' },
        pay('Start 7-day free trial', 'trial', true), pay('Yearly', 'pay-yearly'), pay('Monthly', 'pay-monthly'),
        pay('Lifetime — pay once', 'pay-lifetime'), pay('Already paid? Log in', 'login')),
    )
  }
  // click-wrap: trials/purchases stay disabled until the ToS is accepted
  if (payBtns.length > 0 && !tosAccepted) {
    for (const b of payBtns) b.setAttribute('disabled', '')
    const box = h('input', { type: 'checkbox' }) as HTMLInputElement
    box.addEventListener('change', async () => {
      if (box.checked) {
        await saveTosAcceptance()
        for (const b of payBtns) b.removeAttribute('disabled')
      } else {
        for (const b of payBtns) b.setAttribute('disabled', '')
      }
    })
    panel.append(h('div', { class: 'row' }, box,
      h('div', {},
        h('label', { class: 'main' }, 'I agree to the Terms of Service and Privacy Policy'),
        (() => {
          const sub = h('div', { class: 'sub' })
          sub.append(
            h('a', { href: 'https://doublecheck.possibility.com/terms.html', target: '_blank', rel: 'noopener' }, 'Terms of Service'),
            ' · ',
            h('a', { href: 'https://doublecheck.possibility.com/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy Policy'),
          )
          return sub
        })(),
      )))
  }

  // gauge B2B demand without building a licensing scheme yet: a tagged
  // mailto makes inquiries countable in the inbox
  const teamLink = h('a', {
    href: 'mailto:tmh@possibility.com?subject=' +
      encodeURIComponent('Double Check — Team pricing inquiry') +
      '&body=' + encodeURIComponent('How many people on your team?\nWhat does your team do?\n'),
  }, 'Contact us about team pricing')
  panel.append(h('p', { class: 'muted', style: 'margin-top:14px' },
    'Outfitting a team? ', teamLink, '.'))

  // dev/tester override — only possible on unpacked installs (store builds
  // have an update_url, so this section never renders for real customers)
  if (!chrome.runtime.getManifest().update_url) {
    const box = h('input', { type: 'checkbox' }) as HTMLInputElement
    void chrome.storage.local.get(STORAGE_KEYS.devLicense).then((obj) => {
      box.checked = obj[STORAGE_KEYS.devLicense] === true
    })
    box.addEventListener('change', async () => {
      await chrome.storage.local.set({ [STORAGE_KEYS.devLicense]: box.checked })
      location.reload()
    })
    panel.append(h('div', { class: 'row' }, box,
      h('div', {},
        h('label', { class: 'main' }, 'Developer build: unlock all features'),
        h('div', { class: 'sub' }, 'Visible only on unpacked installs, for testing. Store installs ignore this entirely.'))))
  }
  return panel
}

export async function renderSettingsTab(rootEl: HTMLElement): Promise<void> {
  const settings = await getSettings()
  const stats = await getStats()
  const license = (await chrome.runtime
    .sendMessage({ kind: 'dc-license-status' })
    .catch(() => null)) as LicenseStatus | null
  const tosAccepted = (await getTosAcceptance()) !== null

  const save = () => void saveSettings(settings)

  const toggle = (label: string, sub: string, get: () => boolean, set: (v: boolean) => void) => {
    const box = h('input', { type: 'checkbox' }) as HTMLInputElement
    box.checked = get()
    box.addEventListener('change', () => {
      set(box.checked)
      save()
    })
    return h('div', { class: 'row' }, box,
      h('div', {}, h('label', { class: 'main' }, label), h('div', { class: 'sub' }, sub)))
  }

  const retention = h('select', {}) as HTMLSelectElement
  for (const [v, label] of [['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['0', 'Keep forever']]) {
    const opt = h('option', { value: v }, label)
    if (Number(v) === settings.logRetentionDays) opt.setAttribute('selected', '')
    retention.appendChild(opt)
  }
  retention.addEventListener('change', () => {
    settings.logRetentionDays = Number(retention.value)
    save()
  })

  const shortcutBtn = h('button', { class: 'btn' }, 'Change keyboard shortcut')
  shortcutBtn.addEventListener('click', () => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }))

  rootEl.append(
    licensePanel(license, tosAccepted),
    h('section', { class: 'panel' },
      h('h2', {}, 'Your numbers'),
      h('div', { class: 'stats' },
        h('div', {}, h('div', { class: 'stat' }, String(stats.checked)), h('div', { class: 'statlbl' }, 'values double-checked')),
        h('div', {}, h('div', { class: 'stat' }, String(stats.mismatchesCaught)), h('div', { class: 'statlbl' }, 'mismatches caught')),
      ),
      h('p', { class: 'muted' }, 'Counted locally on this device. Like everything else here, never transmitted.'),
    ),
    h('section', { class: 'panel' },
      h('h2', {}, 'Verification'),
      h('p', { class: 'muted' },
        'Read-aloud is a 🔊 button on each check card — per value, your call, using a local on-device voice only. ' +
        'If your device has no local voice, the button hides itself.'),
      h('div', { class: 'row' },
        h('div', {},
          h('label', { class: 'main' }, 'Keyboard shortcut'),
          h('div', { class: 'sub' },
            'Focus a field on any page and press the shortcut to open Double Check. Default: Shift+Command+Space ' +
            'on a Mac (Chrome shows it as ⇧⌘Space — ⇧ is the Shift key, ⌘ is Command), Ctrl+Shift+Space elsewhere.'),
          h('div', { class: 'btnrow' }, shortcutBtn),
        ),
      ),
    ),
    h('section', { class: 'panel' },
      h('h2', {}, 'Audit log'),
      h('div', { class: 'row' },
        h('div', {},
          h('label', { class: 'main' }, 'Retention'),
          h('div', { class: 'sub' }, 'Entries older than this are deleted automatically.'),
        ),
        retention,
      ),
      toggle(
        'Store a cryptographic fingerprint of verified values',
        'An HMAC-SHA-256 with a random key that never leaves this device — lets you later prove a logged check matches a specific value, without storing the value. ' +
        'Off by default: if someone steals both your log and the key, short numeric values could be brute-forced against the fingerprint.',
        () => settings.hmacFingerprint, (v) => (settings.hmacFingerprint = v),
      ),
    ),
  )
}
