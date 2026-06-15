import { builtinById } from '../../engine'
import { h } from '../../shared/dom'
import { clearTrustedAccounts, getTrustedAccounts, removeTrustedAccount } from '../../shared/storage'

export async function renderTrustedTab(rootEl: HTMLElement): Promise<void> {
  const render = async (): Promise<void> => {
    rootEl.textContent = ''
    const accounts = (await getTrustedAccounts())
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label) || Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt))

    const panel = h('section', { class: 'panel' },
      h('h2', {}, `Trusted accounts (${accounts.length})`),
      h('p', { class: 'muted' },
        'Accounts you’ve saved for a payee, so Double Check can warn when one changes — the check that ' +
        'catches “our bank details changed” fraud. Each is stored as a one-way fingerprint, never the value, ' +
        'and never leaves this device.'),
    )
    rootEl.append(panel)

    if (!accounts.length) {
      panel.append(h('p', { class: 'muted' },
        'None saved yet. On a green match, name the payee in the “Payee” field to remember its account.'))
      return
    }

    const list = h('div', { class: 'vlist' })
    for (const a of accounts) {
      const fmtName = builtinById.get(a.format)?.name ?? a.format
      const del = h('button', { class: 'btn danger' }, 'Delete')
      del.addEventListener('click', async () => {
        await removeTrustedAccount(a.id)
        await render()
      })
      list.append(h('div', { class: 'vitem' },
        h('span', { class: 'name' }, a.label),
        h('span', { class: 'meta' },
          `${fmtName} · ${a.origin.replace(/^https?:\/\//, '')} · used ${a.useCount}× · ` +
          `last ${new Date(a.lastUsedAt).toLocaleDateString()}`),
        del))
    }
    const clearBtn = h('button', { class: 'btn danger' }, 'Delete all')
    clearBtn.addEventListener('click', async () => {
      if (confirm('Delete all trusted accounts?')) {
        await clearTrustedAccounts()
        await render()
      }
    })
    panel.append(list, h('div', { class: 'btnrow' }, clearBtn))
  }
  await render()
}
