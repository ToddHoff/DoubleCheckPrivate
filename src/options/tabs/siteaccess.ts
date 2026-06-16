import { h } from '../../shared/dom'

// Lists the host permissions the user has granted at runtime (Solution B: per-
// site access to verify a field sealed in a cross-origin frame, e.g. a card
// number in a payment processor's iframe) and lets them revoke each one.
export async function renderSiteAccessTab(rootEl: HTMLElement): Promise<void> {
  const all = await chrome.permissions.getAll()
  // extensionpay is a declared content-script host, not a granted host permission,
  // but filter defensively so it can never be revoked here and break payments
  const origins = (all.origins ?? []).filter((o) => o !== 'https://extensionpay.com/*')

  const list = h('div', { class: 'vlist' })
  const repaint = () => {
    list.textContent = ''
    if (!origins.length) {
      list.append(h('p', { class: 'muted' },
        'No sites granted. Double Check has access to nothing right now — it asks per-site, only when you choose to verify a field inside that site’s secure frame.'))
      return
    }
    for (const origin of origins) {
      const host = origin.replace(/^https?:\/\//, '').replace(/\/\*$/, '')
      const remove = h('button', { class: 'btn danger' }, 'Remove access')
      remove.addEventListener('click', async () => {
        await chrome.permissions.remove({ origins: [origin] })
        origins.splice(origins.indexOf(origin), 1)
        repaint()
      })
      list.append(h('div', { class: 'vitem' }, h('span', { class: 'mono' }, host), remove))
    }
  }
  repaint()

  rootEl.append(
    h('section', { class: 'panel' },
      h('h2', {}, 'Site access'),
      h('p', { class: 'muted' },
        'Double Check has no standing access to any website. These are the only sites where ' +
        'you’ve allowed it to reach inside a secure frame to verify a field — for example a card ' +
        'number in a payment processor’s iframe. Remove a site to revoke that access; Double Check ' +
        'will ask again the next time you verify a field there.'),
      list,
    ),
  )
}
