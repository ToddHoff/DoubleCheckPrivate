// Page scan: flag the high-value fields on a page so the user knows which
// ones are worth double-checking. Reads only field signals (name/label/type),
// never values, and runs entirely locally — same privacy posture as the rest.
import { highValueCandidate } from '../engine'
import type { Validator } from '../engine'
import { fieldSignals, isCheckable, type CheckableField } from './field'

const TAG_CSS = `
:host { all: initial; }
.tag {
  position: fixed; z-index: 2147483646; font: 600 11px/1 system-ui, sans-serif;
  padding: 4px 9px; border-radius: 9999px; background: #166534; color: #fff;
  border: 1px solid #14532d; cursor: pointer; white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0,0,0,.2);
}
.tag:hover { background: #14532d; }
.banner {
  position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
  z-index: 2147483647; font: 600 13px system-ui, sans-serif;
  background: #166534; color: #fff; padding: 9px 16px; border-radius: 9999px;
  box-shadow: 0 6px 18px rgba(0,0,0,.25); display: flex; gap: 12px; align-items: center;
}
.banner.none { background: #4b5563; }
.banner button {
  border: 0; background: rgba(255,255,255,.2); color: #fff; font: 600 12px system-ui, sans-serif;
  border-radius: 9999px; padding: 3px 10px; cursor: pointer;
}
`

let activeHost: HTMLElement | null = null

export function clearScanTags(): void {
  activeHost?.remove()
  activeHost = null
}

/**
 * Scan the document for high-value fields and tag each with a clickable pill.
 * onPick(field) is called when the user clicks a tag (to open the card there).
 * Returns the number of fields tagged.
 */
export function scanAndTag(validators: Validator[], onPick: (field: CheckableField) => void): number {
  clearScanTags()

  const host = document.createElement('div')
  host.setAttribute('data-double-check-scan', '')
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = TAG_CSS
  root.appendChild(style)
  document.documentElement.appendChild(host)
  activeHost = host

  const fields = [...document.querySelectorAll('input, textarea')].filter((el): el is CheckableField =>
    isCheckable(el),
  )

  const positioners: Array<() => void> = []
  let count = 0
  for (const field of fields) {
    const candidate = highValueCandidate(fieldSignals(field), validators)
    if (!candidate) continue
    const name = validators.find((v) => v.id === candidate.id)?.name ?? 'value'
    count++

    const tag = document.createElement('button')
    tag.className = 'tag'
    tag.textContent = `Double-check: ${name}?`
    tag.title = 'Open Double Check on this field'
    tag.addEventListener('click', () => {
      clearScanTags()
      onPick(field)
    })
    root.appendChild(tag)

    const position = () => {
      const r = field.getBoundingClientRect()
      if ((r.width === 0 && r.height === 0) || r.bottom < 0 || r.top > window.innerHeight) {
        tag.style.display = 'none'
        return
      }
      tag.style.display = ''
      tag.style.left = `${Math.max(2, Math.min(r.left, window.innerWidth - tag.offsetWidth - 4))}px`
      tag.style.top = `${Math.max(2, r.top - tag.offsetHeight - 2)}px`
    }
    position()
    positioners.push(position)
  }

  // banner: result summary + dismiss
  const banner = document.createElement('div')
  banner.className = count ? 'banner' : 'banner none'
  const label = document.createElement('span')
  label.textContent = count
    ? `Double Check flagged ${count} field${count === 1 ? '' : 's'} worth verifying — click a tag.`
    : 'Double Check found no high-value fields on this page.'
  const dismiss = document.createElement('button')
  dismiss.textContent = 'Dismiss'
  dismiss.addEventListener('click', clearScanTags)
  banner.append(label, dismiss)
  root.appendChild(banner)
  // reposition tags now that the banner exists (offsetWidth was needed)
  for (const p of positioners) p()
  if (!count) setTimeout(() => { if (activeHost === host) clearScanTags() }, 4000)

  const reposition = () => requestAnimationFrame(() => positioners.forEach((p) => p()))
  window.addEventListener('scroll', reposition, { capture: true, passive: true })
  window.addEventListener('resize', reposition, { passive: true })
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') clearScanTags()
  }
  window.addEventListener('keydown', onKey, true)

  // tie listener cleanup to host removal
  const observer = new MutationObserver(() => {
    if (!host.isConnected) {
      window.removeEventListener('scroll', reposition, { capture: true })
      window.removeEventListener('resize', reposition)
      window.removeEventListener('keydown', onKey, true)
      observer.disconnect()
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  return count
}
