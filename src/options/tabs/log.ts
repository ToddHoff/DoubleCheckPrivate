import { downloadText, h } from '../../shared/dom'
import { clearLog, getLog, verifyLogIntegrity } from '../../shared/storage'
import type { LogEntry } from '../../shared/types'

function toCsv(entries: LogEntry[]): string {
  const cols = ['at', 'event', 'origin', 'fieldLabel', 'format', 'methods', 'result', 'attested', 'valueLength', 'durationMs', 'stale', 'signatures', 'note', 'clearedCount', 'fingerprint', 'seal'] as const
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
    if (confirm('Clear the verification log?\n\nThe individual entries are removed, but a permanent, sealed "log cleared" record is kept — it can’t be deleted from here, so a clear is never silent. Continue?')) {
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

  const feed = h('div', { class: 'logfeed' }, ...log.map(entryEl))

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
      log.length ? feed : h('p', { class: 'muted' }, 'No checks logged yet. Focus a field on any page and press the shortcut.'),
    ),
  )
}

function resultChip(e: LogEntry): HTMLElement {
  if (e.stale) return h('span', { class: 'chip warn' }, '⚠ changed after check')
  if (e.result === 'mismatch-resolved') return h('span', { class: 'chip warn' }, 'mismatch caught → resolved')
  return h('span', { class: 'chip ok' }, '✓ match')
}

// one stacked card per check — notes and signatures get their own full-width
// line instead of being squeezed into table columns
function entryEl(e: LogEntry): HTMLElement {
  if (e.event === 'log-cleared') {
    const n = e.clearedCount ?? 0
    return h('div', { class: 'le le-event' },
      h('div', { class: 'le-top' },
        h('span', { class: 'chip warn' }, '🧹 Log cleared'),
        h('span', { class: 'le-when' }, new Date(e.at).toLocaleString()),
      ),
      h('div', { class: 'le-meta' },
        `${n} verification ${n === 1 ? 'entry' : 'entries'} removed · permanent, sealed record — can’t be deleted`),
    )
  }
  const parts: (Node | string)[] = [
    h('div', { class: 'le-top' },
      resultChip(e),
      h('span', { class: 'le-when' }, new Date(e.at).toLocaleString()),
      h('span', { class: 'le-fmt' }, e.format),
    ),
    h('div', { class: 'le-where' },
      h('strong', {}, e.fieldLabel),
      h('span', { class: 'le-site' }, ` · ${e.origin.replace(/^https?:\/\//, '')}`),
    ),
    h('div', { class: 'le-meta' }, `${e.methods.join(' + ')} · ${e.valueLength} chars`),
  ]
  if (e.signatures?.length) {
    parts.push(h('div', { class: 'le-meta' }, `Signed: ${e.signatures.join(' + ')}`))
  }
  if (e.note) {
    parts.push(h('div', { class: 'le-note' }, h('span', { class: 'le-notelbl' }, 'Note'), e.note))
  }
  return h('div', { class: 'le' }, ...parts)
}
