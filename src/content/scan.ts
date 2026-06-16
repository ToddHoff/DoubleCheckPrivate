// Page-level passes that flag fields with a clickable pill near each one.
// Two modes:
//   scanAndTag  — green "candidates worth verifying" (by field signals)
//   auditAndFlag — red "values with detected problems" (failed checksums,
//                  bad country codes, hidden/look-alike characters)
// Both read locally and never transmit anything. Clicking a pill opens the
// card on that field; Esc or Dismiss clears them.
import { highValueCandidate, suspiciousChars, validate } from '../engine'
import type { Validator } from '../engine'
import { bumpStat } from '../shared/storage'
import { fieldSignals, isCheckable, type CheckableField } from './field'

const FLAG_CSS = `
:host { all: initial; }
.pill {
  position: fixed; z-index: 2147483646; font: 600 11px/1.25 system-ui, sans-serif;
  padding: 4px 9px; border-radius: 9px; cursor: pointer; max-width: 320px;
  box-shadow: 0 2px 6px rgba(0,0,0,.2);
}
.pill.ok { background: #166534; color: #fff; border: 1px solid #14532d; white-space: nowrap; }
.pill.ok:hover { background: #14532d; }
.pill.bad { background: #b91c1c; color: #fff; border: 1px solid #991b1b; }
.pill.bad:hover { background: #991b1b; }
.banner {
  position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
  z-index: 2147483647; font: 600 13px system-ui, sans-serif; color: #fff;
  padding: 9px 16px; border-radius: 9999px; box-shadow: 0 6px 18px rgba(0,0,0,.25);
  display: flex; gap: 12px; align-items: center;
}
.banner.ok { background: #166534; }
.banner.bad { background: #b91c1c; }
.banner.none { background: #4b5563; }
.banner button {
  border: 0; background: rgba(255,255,255,.2); color: #fff; font: 600 12px system-ui, sans-serif;
  border-radius: 9999px; padding: 3px 10px; cursor: pointer;
}
`

type Tone = 'ok' | 'bad'
interface Flag {
  el: HTMLElement // positioning anchor: an input/textarea or a payment iframe
  text: string
  tone: Tone
  action: () => void // what clicking the pill does
}

let activeHost: HTMLElement | null = null

export function clearScanTags(): void {
  activeHost?.remove()
  activeHost = null
}

function checkableFields(): CheckableField[] {
  return [...document.querySelectorAll('input, textarea')].filter((el): el is CheckableField =>
    isCheckable(el),
  )
}

// cross-origin iframes that look like a payment/card field (CollectJS, Stripe,
// Braintree, Adyen, etc.) — fields the input-scan can't see into
const CARD_IFRAME_RE = /cc|card|credit|number|payment|cvv|cvc|secur|stripe|braintree|adyen|checkout|safeweb/i
function paymentIframes(): HTMLIFrameElement[] {
  return [...document.querySelectorAll('iframe')].filter((f): f is HTMLIFrameElement => {
    let crossOrigin = false
    try { crossOrigin = !f.contentDocument } catch { crossOrigin = true }
    if (!crossOrigin) return false
    return CARD_IFRAME_RE.test(`${f.id} ${f.name} ${f.title} ${f.src}`.toLowerCase())
  })
}

// the grant/verify flow for a sealed card field has to run through the service
// worker (and, for the first grant, the popup) — content can't request perms
function pickIframe(f: HTMLIFrameElement): void {
  try {
    void chrome.runtime.sendMessage({ kind: 'dc-pill-iframe', origin: new URL(f.src).origin })
  } catch {
    /* iframe has no usable src/origin */
  }
}

function renderFlags(
  flags: Flag[],
  banner: { tone: Tone | 'none'; text: string },
): number {
  clearScanTags()

  const host = document.createElement('div')
  host.setAttribute('data-double-check-scan', '')
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = FLAG_CSS
  root.appendChild(style)
  document.documentElement.appendChild(host)
  activeHost = host

  const positioners: Array<() => void> = []
  for (const { el, text, tone, action } of flags) {
    const pill = document.createElement('button')
    pill.className = `pill ${tone}`
    pill.textContent = text
    pill.title = 'Open Double Check on this field'
    pill.addEventListener('click', () => {
      clearScanTags()
      action()
    })
    root.appendChild(pill)

    const position = () => {
      const r = el.getBoundingClientRect()
      if ((r.width === 0 && r.height === 0) || r.bottom < 0 || r.top > window.innerHeight) {
        pill.style.display = 'none'
        return
      }
      pill.style.display = ''
      pill.style.left = `${Math.max(2, Math.min(r.left, window.innerWidth - pill.offsetWidth - 4))}px`
      pill.style.top = `${Math.max(2, r.top - pill.offsetHeight - 2)}px`
    }
    position()
    positioners.push(position)
  }

  const bar = document.createElement('div')
  bar.className = `banner ${banner.tone}`
  const label = document.createElement('span')
  label.textContent = banner.text
  const dismiss = document.createElement('button')
  dismiss.textContent = 'Dismiss'
  dismiss.addEventListener('click', clearScanTags)
  bar.append(label, dismiss)
  root.appendChild(bar)
  for (const p of positioners) p() // re-place now that widths are known
  if (!flags.length) setTimeout(() => { if (activeHost === host) clearScanTags() }, 4000)

  const reposition = () => requestAnimationFrame(() => positioners.forEach((p) => p()))
  window.addEventListener('scroll', reposition, { capture: true, passive: true })
  window.addEventListener('resize', reposition, { passive: true })
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') clearScanTags()
  }
  window.addEventListener('keydown', onKey, true)
  const observer = new MutationObserver(() => {
    if (!host.isConnected) {
      window.removeEventListener('scroll', reposition, { capture: true })
      window.removeEventListener('resize', reposition)
      window.removeEventListener('keydown', onKey, true)
      observer.disconnect()
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  return flags.length
}

/** flag high-value fields worth verifying (by field signals), green pills */
export function scanAndTag(validators: Validator[], onPick: (field: CheckableField) => void): number {
  const flags: Flag[] = []
  for (const field of checkableFields()) {
    const candidate = highValueCandidate(fieldSignals(field), validators)
    if (!candidate) continue
    const name = validators.find((v) => v.id === candidate.id)?.name ?? 'value'
    flags.push({ el: field, text: `Double-check: ${name}?`, tone: 'ok', action: () => onPick(field) })
  }
  // sealed card fields the input-scan can't see into — tag the iframe itself
  for (const f of paymentIframes()) {
    flags.push({ el: f, text: '🔒 Verify card field (secure frame)', tone: 'ok', action: () => pickIframe(f) })
  }
  return renderFlags(flags, {
    tone: flags.length ? 'ok' : 'none',
    text: flags.length
      ? `Double Check flagged ${flags.length} field${flags.length === 1 ? '' : 's'} worth verifying — click a tag.`
      : 'Double Check found no high-value fields on this page.',
  })
}

/** audit filled fields for detectable problems; red pills with the issue */
export function auditAndFlag(validators: Validator[], onPick: (field: CheckableField) => void): number {
  const flags: Flag[] = []
  for (const field of checkableFields()) {
    const raw = field.value
    if (!raw.trim()) continue // nothing entered to check

    const problems: string[] = []
    const candidate = highValueCandidate(fieldSignals(field), validators)
    if (candidate) {
      // a strongly-identified field whose entered value doesn't hold up.
      // deceptive characters first — they're the root cause, not the
      // downstream "doesn't match the format"
      const v = validators.find((x) => x.id === candidate.id)!
      const r = validate(v, raw)
      problems.push(...r.warnings.filter((w) => /hidden|look-alike/i.test(w)))
      problems.push(...r.errors)
    } else {
      // unknown field — still flag deceptive characters, which are bad anywhere
      problems.push(...suspiciousChars(raw))
    }
    if (problems.length) flags.push({ el: field, text: problems[0], tone: 'bad', action: () => onPick(field) })
  }
  if (flags.length) void bumpStat('pageProblemsFound', flags.length)
  return renderFlags(flags, {
    tone: flags.length ? 'bad' : 'none',
    text: flags.length
      ? `Double Check found ${flags.length} field${flags.length === 1 ? '' : 's'} with a problem — click to fix.`
      : 'Double Check found no problems in the filled fields on this page.',
  })
}
