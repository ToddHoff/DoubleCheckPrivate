import { h } from '../../shared/dom'
import { getSettings, getStats, saveSettings } from '../../shared/storage'
import type { LicenseStatus } from '../../shared/types'

function licensePanel(lic: LicenseStatus | null): HTMLElement {
  const pay = (label: string, action: string, primary = false) => {
    const b = h('button', { class: primary ? 'btn primary' : 'btn' }, label)
    b.addEventListener('click', () => void chrome.runtime.sendMessage({ kind: 'dc-payment-action', action }))
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
  return panel
}

export async function renderSettingsTab(rootEl: HTMLElement): Promise<void> {
  const settings = await getSettings()
  const stats = await getStats()
  const license = (await chrome.runtime
    .sendMessage({ kind: 'dc-license-status' })
    .catch(() => null)) as LicenseStatus | null

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
    licensePanel(license),
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
          h('div', { class: 'sub' }, 'Focus a field on any page and press the shortcut to open Double Check (default Ctrl/⌘+Shift+Space).'),
          h('div', { class: 'btnrow' }, shortcutBtn),
        ),
      ),
    ),
    (() => {
      const panel = h('section', { class: 'panel' },
        h('h2', {}, 'Submit Guard (beta)'),
        h('p', { class: 'muted' },
          'On listed sites, forms won’t submit while a field you normally double-check there is unverified. ' +
          'Limits: it arms only after you’ve opened Double Check on the page, and some single-page apps ' +
          'submit in ways no extension can intercept — the attestation, not the guard, is the real control.'),
      )
      const list = h('div', { class: 'vlist' })
      const renderList = () => {
        list.textContent = ''
        for (const origin of settings.submitGuardOrigins) {
          const rm = h('button', { class: 'btn danger' }, 'Remove')
          rm.addEventListener('click', () => {
            settings.submitGuardOrigins = settings.submitGuardOrigins.filter((o) => o !== origin)
            save()
            renderList()
          })
          list.appendChild(h('div', { class: 'vitem' }, h('span', { class: 'name' }, origin), h('span', { class: 'meta' }), rm))
        }
        if (!settings.submitGuardOrigins.length) {
          list.appendChild(h('p', { class: 'muted' }, 'No guarded sites yet.'))
        }
      }
      renderList()
      const input = h('input', { type: 'text', class: 'mono', placeholder: 'https://wires.examplebank.com', style: 'flex:1' }) as HTMLInputElement
      const add = h('button', { class: 'btn' }, 'Add site')
      add.addEventListener('click', () => {
        try {
          const origin = new URL(input.value.trim()).origin
          if (!settings.submitGuardOrigins.includes(origin)) {
            settings.submitGuardOrigins = [...settings.submitGuardOrigins, origin]
            save()
            renderList()
          }
          input.value = ''
        } catch {
          input.value = ''
          input.placeholder = 'Enter a full URL, e.g. https://wires.examplebank.com'
        }
      })
      panel.append(list, h('div', { class: 'btnrow', style: 'display:flex' }, input, add))
      return panel
    })(),
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
