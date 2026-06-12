import type { FieldSignals } from '../engine'

export type CheckableField = HTMLInputElement | HTMLTextAreaElement

const CHECKABLE_INPUT_TYPES = new Set(['text', 'number', 'tel', 'email', 'search', 'url', 'password'])

export function isCheckable(el: Element | null): el is CheckableField {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled
  if (el instanceof HTMLInputElement) {
    return CHECKABLE_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled
  }
  return false
}

/** find the focused checkable field, drilling through open shadow roots */
export function findFocusedField(): CheckableField | null {
  let el: Element | null = document.activeElement
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
  return isCheckable(el) ? el : null
}

function labelText(el: CheckableField): string {
  if (el.labels?.length) {
    const t = el.labels[0].textContent?.trim()
    if (t) return t
  }
  const aria = el.getAttribute('aria-label')?.trim()
  if (aria) return aria
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const t = labelledBy
      .split(/\s+/)
      .map((id) => (el.getRootNode() as Document | ShadowRoot).getElementById?.(id)?.textContent?.trim())
      .filter(Boolean)
      .join(' ')
    if (t) return t
  }
  const wrapping = el.closest('label')?.textContent?.trim()
  if (wrapping) return wrapping
  return ''
}

export function fieldSignals(el: CheckableField): FieldSignals {
  return {
    name: el.name || undefined,
    id: el.id || undefined,
    label: labelText(el) || undefined,
    placeholder: el.placeholder || undefined,
    autocomplete: el.getAttribute('autocomplete') ?? undefined,
    inputmode: el.getAttribute('inputmode') ?? undefined,
    type: el instanceof HTMLInputElement ? el.type : 'textarea',
    maxLength: el.maxLength > 0 ? el.maxLength : undefined,
    value: el.value || undefined,
  }
}

/** stable-ish identity for per-site format memory; never includes the value */
export function fieldSignature(el: CheckableField): string {
  const s = fieldSignals(el)
  return [s.name ?? '', s.id ?? '', (s.label ?? '').slice(0, 60)].join('|')
}

/** short human label for the audit log */
export function fieldDescription(el: CheckableField): string {
  const s = fieldSignals(el)
  return (s.label || s.name || s.placeholder || s.id || 'unnamed field').slice(0, 120)
}

/**
 * Write a value into the field so framework-controlled inputs register it.
 * Why: React replaces the value setter on the element; assigning el.value
 * directly updates the DOM but not React state. Calling the PROTOTYPE setter
 * then dispatching input/change makes every major framework see the change.
 */
export function writeFieldValue(el: CheckableField, value: string): void {
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

// ---- verified badge + tamper watch ----

export interface BadgeHandle {
  /** flip to the warning state (value changed after attestation) */
  invalidate(): void
  remove(): void
}

export function attachBadge(el: CheckableField, onTamper: () => void): BadgeHandle {
  const host = document.createElement('div')
  host.setAttribute('data-double-check-badge', '')
  const root = host.attachShadow({ mode: 'closed' })
  const chip = document.createElement('span')
  chip.textContent = '✓ Double-Checked'
  chip.style.cssText = [
    'position:fixed', 'z-index:2147483646', 'font:600 11px/1 system-ui,sans-serif',
    'padding:3px 7px', 'border-radius:9999px', 'background:#dcfce7', 'color:#166534',
    'border:1px solid #86efac', 'pointer-events:none', 'white-space:nowrap',
  ].join(';')
  root.appendChild(chip)
  document.documentElement.appendChild(host)

  const position = () => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) {
      chip.style.display = 'none'
      return
    }
    chip.style.display = ''
    chip.style.left = `${Math.max(0, r.right - chip.offsetWidth - 4)}px`
    chip.style.top = `${r.top - chip.offsetHeight / 2}px`
  }
  position()
  const reposition = () => requestAnimationFrame(position)
  window.addEventListener('scroll', reposition, { capture: true, passive: true })
  window.addEventListener('resize', reposition, { passive: true })

  const verifiedValue = el.value
  let tampered = false
  const watch = () => {
    if (!tampered && el.value !== verifiedValue) {
      tampered = true
      chip.textContent = '⚠ Changed after check'
      chip.style.background = '#fef3c7'
      chip.style.color = '#92400e'
      chip.style.borderColor = '#fcd34d'
      onTamper()
    } else if (tampered && el.value === verifiedValue) {
      tampered = false
      chip.textContent = '✓ Double-Checked'
      chip.style.background = '#dcfce7'
      chip.style.color = '#166534'
      chip.style.borderColor = '#86efac'
    }
    position()
  }
  el.addEventListener('input', watch)

  return {
    invalidate() {
      tampered = true
      watch()
    },
    remove() {
      el.removeEventListener('input', watch)
      window.removeEventListener('scroll', reposition, { capture: true })
      window.removeEventListener('resize', reposition)
      host.remove()
    },
  }
}
