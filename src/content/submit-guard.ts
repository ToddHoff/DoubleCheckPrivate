// Submit Guard (beta, per-site opt-in): blocks form submission while fields
// the user historically double-checks on this site are unverified.
//
// Honest limits (also in the docs): programmatic form.submit() fires no
// event, and SPAs that POST via fetch from click handlers bypass 'submit'
// entirely — the click interceptor below catches most of those but not all.
// And because this extension has no host permissions, the guard arms only
// after Double Check has been opened on the page. The human attestation is
// the primary control; this is a seatbelt, not a wall.

import { fieldSignature, isCheckable, type CheckableField } from './field'
import { getSiteMemory, siteMemoryKey } from '../shared/storage'

const verified = new WeakSet<CheckableField>()
let rememberedSignatures: Set<string> | null = null
let installed = false

export function markVerified(field: CheckableField): void {
  verified.add(field)
}

export function markTampered(field: CheckableField): void {
  verified.delete(field)
}

function guardedFieldsIn(form: HTMLFormElement): CheckableField[] {
  const out: CheckableField[] = []
  for (const el of form.querySelectorAll('input, textarea')) {
    if (isCheckable(el) && rememberedSignatures?.has(fieldSignature(el))) out.push(el)
  }
  return out
}

function firstUnverified(form: HTMLFormElement): CheckableField | null {
  return guardedFieldsIn(form).find((f) => !verified.has(f)) ?? null
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

function toast(message: string): void {
  document.querySelector('[data-double-check-toast]')?.remove()
  const host = document.createElement('div')
  host.setAttribute('data-double-check-toast', '')
  const root = host.attachShadow({ mode: 'closed' })
  const el = document.createElement('div')
  el.textContent = message
  el.setAttribute('role', 'alert')
  el.style.cssText =
    'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'background:#92400e;color:#fff;font:600 13.5px system-ui,sans-serif;' +
    'padding:10px 18px;border-radius:9999px;box-shadow:0 6px 18px rgba(0,0,0,.25)'
  root.appendChild(el)
  document.documentElement.appendChild(host)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => host.remove(), 4000)
}

function block(e: Event, field: CheckableField): void {
  e.preventDefault()
  e.stopImmediatePropagation()
  toast('Double Check: verify the highlighted field before submitting (focus it and press the shortcut)')
  field.focus()
  field.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

export async function installSubmitGuard(guardOrigins: string[]): Promise<void> {
  if (installed || !guardOrigins.includes(location.origin)) return
  installed = true
  const memory = await getSiteMemory()
  const prefix = siteMemoryKey(location.origin, '')
  rememberedSignatures = new Set(
    Object.keys(memory).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)),
  )

  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target
      if (!(form instanceof HTMLFormElement)) return
      const missing = firstUnverified(form)
      if (missing) block(e, missing)
    },
    true,
  )

  // second layer: SPA submit buttons that never fire a real submit event
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target
      if (!(target instanceof Element)) return
      const btn = target.closest('button, input[type="submit"]')
      if (!btn) return
      const form = btn.closest('form')
      if (!form) return
      const type = btn instanceof HTMLButtonElement ? (btn.type || 'submit') : 'submit'
      if (type !== 'submit') return
      const missing = firstUnverified(form)
      if (missing) block(e, missing)
    },
    true,
  )
}
