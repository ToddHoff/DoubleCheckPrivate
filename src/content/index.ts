// Injected on demand (activeTab). Finds the focused field, gathers context,
// mounts the card. Guard: executeScript may run this more than once per page.
import { BUILTIN_VALIDATORS, fromUserSpec, suggestFormats } from '../engine'
import type { Validator } from '../engine'
import { getDualSignFields, getSettings, getSiteMemory, getUserValidatorSpecs, siteMemoryKey } from '../shared/storage'
import type { LicenseStatus } from '../shared/types'
import { fieldSignals, fieldSignature, findFocusedField, type CheckableField } from './field'
import { isCardMounted, mountCard, type CardContext } from './card'
import { installSubmitGuard } from './submit-guard'
import { auditAndFlag, markSealedFields, scanAndTag } from './scan'

declare global {
  interface Window {
    __doubleCheckLoaded?: boolean
  }
}

async function buildContext(field: CheckableField, detached = false, relayHost?: string): Promise<CardContext> {
  const [settings, userSpecs, siteMemory, dualSign, license] = await Promise.all([
    getSettings(),
    getUserValidatorSpecs(),
    getSiteMemory(),
    getDualSignFields(),
    chrome.runtime
      .sendMessage({ kind: 'dc-license-status' })
      .catch(() => null) as Promise<LicenseStatus | null>,
  ])
  const lic = license ?? { active: true, trial: false, trialDaysLeft: -1, cached: true }
  // custom formats are a paid feature; built-ins always work
  const userValidators = lic.active
    ? userSpecs.map(fromUserSpec).filter((v): v is Validator => v !== null)
    : []
  const validators = [...BUILTIN_VALIDATORS, ...userValidators]
  const fieldKey = siteMemoryKey(location.origin, fieldSignature(field))
  // a detached card's field signature is meaningless ("||"), so it would collide
  // with any no-signature field's remembered format on this origin — ignore
  // remembered for detached and let value-based detection pick the format
  const remembered = detached ? undefined : siteMemory[fieldKey]
  const suggestions = suggestFormats(fieldSignals(field), validators)
  return {
    validators,
    suggestions,
    remembered: validators.some((v) => v.id === remembered) ? remembered : undefined,
    settings,
    license: lic,
    requireDualSign: !detached && !!dualSign[fieldKey],
    detached,
    relayHost,
  }
}

function openOn(field: CheckableField): void {
  if (isCardMounted(field)) return
  void buildContext(field).then((ctx) => mountCard(field, ctx))
}

// the focused field is sealed in a cross-origin frame we don't have access to
// yet, and the grant can only come from the popup — so float a hint next to the
// field pointing the user at the toolbar icon. Turns a dead shortcut press into
// guidance instead of silence.
function renderSealedHint(host: string): void {
  if (window !== window.top) return
  document.querySelector('[data-double-check-hint]')?.remove()
  const anchor = document.activeElement instanceof HTMLIFrameElement ? document.activeElement : null
  const wrap = document.createElement('div')
  wrap.setAttribute('data-double-check-hint', '')
  const root = wrap.attachShadow({ mode: 'closed' })
  const box = document.createElement('div')
  box.textContent = `🔒 This field is inside a secure frame (${host}). Click the Double Check icon in your toolbar to verify it.`
  box.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'max-width:300px', 'box-sizing:border-box',
    'padding:10px 12px', 'border-radius:10px', 'background:#1f2937', 'color:#f9fafb',
    'font:600 12.5px/1.45 system-ui,-apple-system,sans-serif', 'box-shadow:0 4px 16px rgba(0,0,0,.3)',
    'cursor:pointer', 'border:1px solid #374151',
  ].join(';')
  root.appendChild(box)
  document.documentElement.appendChild(wrap)
  const place = () => {
    const r = anchor?.getBoundingClientRect()
    if (r && (r.width || r.height)) {
      box.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - box.offsetWidth - 8))}px`
      box.style.top = `${Math.max(8, r.top - box.offsetHeight - 8)}px`
    } else {
      box.style.left = `${Math.max(8, (window.innerWidth - box.offsetWidth) / 2)}px`
      box.style.top = '24px'
    }
  }
  place()
  const reposition = () => requestAnimationFrame(place)
  window.addEventListener('scroll', reposition, { capture: true, passive: true })
  window.addEventListener('resize', reposition, { passive: true })
  const dismiss = () => {
    wrap.remove()
    window.removeEventListener('scroll', reposition, { capture: true })
    window.removeEventListener('resize', reposition)
  }
  box.addEventListener('click', dismiss)
  setTimeout(dismiss, 9000)
}

// open the card on a value relayed out of a cross-origin frame (Solution B):
// a detached scratch input holds the value; the card runs in the top frame in
// normal verify mode. Empty value → input mode (the read found nothing).
function openWithValue(value: string | null, host?: string, format?: string): void {
  if (window !== window.top) return // render once, in the top frame
  // anchor the card (and its later badge) to the iframe the value came from, so
  // it appears next to the field instead of floating at the top of the page
  const anchor = document.activeElement instanceof HTMLIFrameElement ? document.activeElement : undefined
  const field = document.createElement('input')
  if (value) field.value = value
  void buildContext(field, true, host).then((ctx) => {
    ctx.relayAnchor = anchor
    ctx.preferredFormat = format // e.g. 'card' — we detected a card-number iframe
    mountCard(field, ctx)
  })
}

function activate(): boolean {
  // Why the top-frame exception: when activation comes from the toolbar
  // popup, the POPUP holds focus, not the page — document.hasFocus() is
  // false even though the user's field is right there (activeElement
  // persists). Subframes still require real focus so only the frame the
  // user is working in mounts a card.
  if (!document.hasFocus() && window !== window.top) return false
  // on any invocation, surface sealed card fields on the page (cross-origin
  // payment frames the shortcut can't reach) — discovery without standing access
  markSealedFields()
  const field = findFocusedField()
  if (!field) return false
  openOn(field)
  return true
}

// scan the page for high-value fields and tag them; clicking a tag opens the
// card on that field. Detection uses built-ins (which cover every high-value
// format); the card itself still builds full, license-aware context.
function scanPage(): number {
  return scanAndTag(BUILTIN_VALIDATORS, openOn)
}

// audit every filled field for detectable problems (failed checksums, bad
// country codes, hidden/look-alike characters) and flag each with the issue
function auditPage(): number {
  return auditAndFlag(BUILTIN_VALIDATORS, openOn)
}

// Why no activate() on load: the background always follows injection with a
// dc-activate message, and the popup's Submit Guard toggle injects this
// script purely to arm the guard — mounting a card then would be a surprise.
if (!window.__doubleCheckLoaded) {
  window.__doubleCheckLoaded = true
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.kind === 'dc-activate') sendResponse({ mounted: activate() })
    else if (msg?.kind === 'dc-open-with-value') { openWithValue(msg.value, msg.host, msg.format); sendResponse({ ok: true }) }
    else if (msg?.kind === 'dc-sealed-hint') { renderSealedHint(msg.host); sendResponse({ ok: true }) }
    else if (msg?.kind === 'dc-scan-page') sendResponse({ ok: true, count: scanPage() })
    else if (msg?.kind === 'dc-audit-page') sendResponse({ ok: true, count: auditPage() })
  })
  void getSettings().then((s) => installSubmitGuard(s.submitGuardOrigins))
}

export {}
