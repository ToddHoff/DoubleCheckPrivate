import { downloadText, h } from '../../shared/dom'
import { clearLog, getLog, verifyLogIntegrity } from '../../shared/storage'
import type { LogEntry } from '../../shared/types'

function toCsv(entries: LogEntry[]): string {
  const cols = ['at', 'origin', 'fieldLabel', 'format', 'methods', 'result', 'attested', 'valueLength', 'durationMs', 'stale', 'signatures', 'note', 'fingerprint', 'seal'] as const
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s)
  const cell = (e: LogEntry, c: typeof cols[number]): string => {
    if (c === 'methods') return e.methods.join('+')
    if (c === 'signatures') return e.signatures?.join(' + ') ?? ''
    return String(e[c] ?? '')
  }
  const rows = entries.map((e) => cols.map((c) => esc(cell(e, c))).join(','))
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

  const integrity = h('span', { class: 'integrity' })
  const verify = h('button', { class: 'btn' }, 'Verify integrity')
  verify.addEventListener('click', async () => {
    const rep = await verifyLogIntegrity()
    integrity.textContent = ''
    if (rep.ok) {
      const older = rep.unsealed ? ` (${rep.unsealed} older, unsealed)` : ''
      integrity.appendChild(h('span', { class: 'chip ok' },
        `✓ ${rep.sealed} sealed ${rep.sealed === 1 ? 'entry' : 'entries'} intact${older}`))
    } else {
      integrity.appendChild(h('span', { class: 'chip warn' },
        `⚠ ${rep.broken!.reason} — first at ${new Date(rep.broken!.at).toLocaleString()}`))
    }
  })

  // only show the Signatures column when something actually signed — otherwise
  // it's an always-empty column that pushes every row to wrap
  const hasSignatures = log.some((e) => e.signatures?.length)
  const hasNotes = log.some((e) => e.note)
  const headers = ['When', 'Site', 'Field', 'Format', 'Methods',
    ...(hasSignatures ? ['Signatures'] : []), ...(hasNotes ? ['Note'] : []), 'Result', 'Len']
  const table = h('table', { class: 'log' },
    h('thead', {}, h('tr', {}, ...headers.map((t) => h('th', {}, t)))),
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
      ...(hasSignatures ? [h('td', {}, e.signatures?.join(' + ') ?? '')] : []),
      ...(hasNotes ? [h('td', { class: 'note' }, e.note ?? '')] : []),
      h('td', {}, result),
      h('td', { class: 'mono' }, String(e.valueLength)),
    ))
  }
  table.appendChild(tbody)
  const tableWrap = h('div', { class: 'logwrap' }, table)

  rootEl.append(
    h('section', { class: 'panel' },
      h('h2', {}, `Verification log (${log.length})`),
      h('p', { class: 'muted' },
        'Proof that checks happened — when, where, what format, that you attested, and (where required) who signed. The verified values themselves are never stored.'),
      h('div', { class: 'btnrow' }, exportCsv, exportJson, verify, clear),
      h('p', { class: 'muted' },
        'Every entry is sealed with a keyed hash chained to the one before it. ' +
        'Verify integrity recomputes the chain to show whether any entry was edited, removed, or reordered ' +
        'since it was written on this device — it is not identity or legal proof.'),
      integrity,
    ),
    h('section', { class: 'panel' },
      log.length ? tableWrap : h('p', { class: 'muted' }, 'No checks logged yet. Focus a field on any page and press the shortcut.'),
    ),
  )
}
