// Injected on demand (activeTab). Finds the focused field, gathers context,
// mounts the card. Guard: executeScript may run this more than once per page.
import { BUILTIN_VALIDATORS, fromUserSpec, suggestFormats } from '../engine'
import type { Validator } from '../engine'
import { getSettings, getSiteMemory, getUserValidatorSpecs, siteMemoryKey } from '../shared/storage'
import type { LicenseStatus } from '../shared/types'
import { fieldSignals, fieldSignature, findFocusedField } from './field'
import { isCardMounted, mountCard, type CardContext } from './card'
import { installSubmitGuard } from './submit-guard'

declare global {
  interface Window {
    __doubleCheckLoaded?: boolean
  }
}

async function buildContext(field: ReturnType<typeof findFocusedField> & object): Promise<CardContext> {
  const [settings, userSpecs, siteMemory, license] = await Promise.all([
    getSettings(),
    getUserValidatorSpecs(),
    getSiteMemory(),
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
  const remembered = siteMemory[siteMemoryKey(location.origin, fieldSignature(field))]
  const suggestions = suggestFormats(fieldSignals(field), validators)
  return {
    validators,
    suggestions,
    remembered: validators.some((v) => v.id === remembered) ? remembered : undefined,
    settings,
    license: lic,
  }
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
  if (isCardMounted(field)) return true
  void buildContext(field).then((ctx) => mountCard(field, ctx))
  return true
}

// Why no activate() on load: the background always follows injection with a
// dc-activate message, and the popup's Submit Guard toggle injects this
// script purely to arm the guard — mounting a card then would be a surprise.
if (!window.__doubleCheckLoaded) {
  window.__doubleCheckLoaded = true
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.kind === 'dc-activate') sendResponse({ mounted: activate() })
  })
  void getSettings().then((s) => installSubmitGuard(s.submitGuardOrigins))
}

export {}
