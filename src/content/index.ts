// Injected on demand (activeTab). Finds the focused field, gathers context,
// mounts the card. Guard: executeScript may run this more than once per page.
import { BUILTIN_VALIDATORS, fromUserSpec, suggestFormats } from '../engine'
import type { Validator } from '../engine'
import { getDualSignFields, getSettings, getSiteMemory, getUserValidatorSpecs, siteMemoryKey } from '../shared/storage'
import type { LicenseStatus } from '../shared/types'
import { fieldSignals, fieldSignature, findFocusedField, type CheckableField } from './field'
import { isCardMounted, mountCard, type CardContext } from './card'
import { installSubmitGuard } from './submit-guard'
import { auditAndFlag, scanAndTag } from './scan'

declare global {
  interface Window {
    __doubleCheckLoaded?: boolean
  }
}

async function buildContext(field: CheckableField): Promise<CardContext> {
  const [settings, userSpecs, siteMemory, dualSign, license] = await Promise.all([
    getSettings(),
    getUserValidatorSpecs(),
    getSiteMemory(),
    getDualSignFields(),
    chrome.runtime
      .sendMessage({ kind: 'dc-license-status' })
      .catch(() => null) as Promise<LicenseStatus | null>,
  ])
  const lic = license ?? { active: true, trial: false, trialDaysLeft: -1, cached: true, started: true }
  // custom formats are a paid feature; built-ins always work
  const userValidators = lic.active
    ? userSpecs.map(fromUserSpec).filter((v): v is Validator => v !== null)
    : []
  const validators = [...BUILTIN_VALIDATORS, ...userValidators]
  const fieldKey = siteMemoryKey(location.origin, fieldSignature(field))
  const remembered = siteMemory[fieldKey]
  const suggestions = suggestFormats(fieldSignals(field), validators)
  return {
    validators,
    suggestions,
    remembered: validators.some((v) => v.id === remembered) ? remembered : undefined,
    settings,
    license: lic,
    requireDualSign: !!dualSign[fieldKey],
  }
}

function openOn(field: CheckableField): void {
  if (isCardMounted(field)) return
  void buildContext(field).then((ctx) => mountCard(field, ctx))
}

function activate(): boolean {
  // Why the top-frame exception: when activation comes from the toolbar
  // popup, the POPUP holds focus, not the page — document.hasFocus() is
  // false even though the user's field is right there (activeElement
  // persists). Subframes still require real focus so only the frame the
  // user is working in mounts a card.
  if (!document.hasFocus() && window !== window.top) return false
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
    else if (msg?.kind === 'dc-scan-page') sendResponse({ ok: true, count: scanPage() })
    else if (msg?.kind === 'dc-audit-page') sendResponse({ ok: true, count: auditPage() })
  })
  void getSettings().then((s) => installSubmitGuard(s.submitGuardOrigins))
}

export {}
