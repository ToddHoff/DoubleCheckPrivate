import { downloadText, h } from '../../shared/dom'
import { clearLog, getLog } from '../../shared/storage'
import type { LogEntry } from '../../shared/types'

function toCsv(entries: LogEntry[]): string {
  const cols = ['at', 'origin', 'fieldLabel', 'format', 'methods', 'result', 'attested', 'valueLength', 'durationMs', 'stale', 'fingerprint'] as const
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s)
  const rows = entries.map((e) =>
    cols.map((c) => {
      const v = c === 'methods' ? e.methods.join('+') : (e[c] ?? '')
      return esc(String(v))
    }).join(','),
  )
  return [cols.join(','), ...rows].join('\n')
}

export async function renderLogTab(rootEl: HTMLElement): Promise<void> {
  const log = (await getLog()).slice().reverse() // newest first

  const exportCsv = h('button', { class: 'btn' }, 'Export CSV')
  exportCsv.addEventListener('click', async () => downloadText('double-check-log.csv', 'text/csv', toCsv(await getLog())))
  const exportJson = h('button', { class: 'btn' }, 'Export JSON')
  exportJson.addEventListener('click', async () =>
    downloadText('double-check-log.json', 'application/json', JSON.stringify(await getLog(), null, 2)))
  const clear = h('button', { class: 'btn danger' }, 'Clear log')
  clear.addEventListener('click', async () => {
    if (confirm('Delete all log entries? This cannot be undone.')) {
      await clearLog()
      rootEl.textContent = ''
      await renderLogTab(rootEl)
    }
  })

  const table = h('table', { class: 'log' },
    h('thead', {}, h('tr', {},
      ...['When', 'Site', 'Field', 'Format', 'Methods', 'Result', 'Len'].map((t) => h('th', {}, t)))),
  )
  const tbody = h('tbody', {})
  for (const e of log) {
    const when = new Date(e.at).toLocaleString()
    const result = e.stale
      ? h('span', { class: 'chip warn' }, '⚠ changed after check')
      : e.result === 'mismatch-resolved'
        ? h('span', { class: 'chip warn' }, 'mismatch caught → resolved')
        : h('span', { class: 'chip ok' }, '✓ match')
    tbody.appendChild(h('tr', {},
      h('td', {}, when),
      h('td', {}, e.origin.replace(/^https?:\/\//, '')),
      h('td', {}, e.fieldLabel),
      h('td', { class: 'mono' }, e.format),
      h('td', { class: 'mono' }, e.methods.join('+')),
      h('td', {}, result),
      h('td', { class: 'mono' }, String(e.valueLength)),
    ))
  }
  table.appendChild(tbody)

  rootEl.append(
    h('section', { class: 'panel' },
      h('h2', {}, `Verification log (${log.length})`),
      h('p', { class: 'muted' },
        'Proof that checks happened — when, where, what format, and that you attested. The verified values themselves are never stored.'),
      h('div', { class: 'btnrow' }, exportCsv, exportJson, clear),
    ),
    h('section', { class: 'panel' },
      log.length ? table : h('p', { class: 'muted' }, 'No checks logged yet. Focus a field on any page and press the shortcut.'),
    ),
  )
}
