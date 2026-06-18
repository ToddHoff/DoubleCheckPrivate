import contentScript from '../content/index?script'
import { getSettings, purgeLog } from '../shared/storage'
import type { RuntimeMessage } from '../shared/types'
import { getLicenseStatus, handlePaymentAction, startLicensing } from './license'

startLicensing()

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })
  }
  void chrome.alarms.create('dc-log-purge', { periodInMinutes: 60 * 24 })
  // right-click invocation on editable fields; recreate idempotently
  // (onInstalled also fires on updates, and duplicate ids throw)
  chrome.contextMenus.removeAll(() => {
    // Why non-overlapping contexts: Chrome groups multiple same-context items
    // from one extension under a "Double Check ▸" submenu, which would bury
    // the common field action behind a hover. Keeping them in separate
    // contexts (a field right-click matches 'editable', not 'page') makes each
    // a single top-level item — "Double-check this field" stays one click.
    chrome.contextMenus.create({
      id: 'dc-check-field',
      title: 'Double-check this field',
      contexts: ['editable'],
    })
    chrome.contextMenus.create({
      id: 'dc-scan-page',
      title: 'Find fields to double-check on this page',
      contexts: ['page', 'selection', 'link', 'image'],
    })
    chrome.contextMenus.create({
      id: 'dc-audit-page',
      title: 'Check this page for problems',
      contexts: ['page', 'selection', 'link', 'image'],
    })
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  // the menu click is the user gesture that grants activeTab, same as the
  // shortcut; right-clicking the field also focuses it
  if (info.menuItemId === 'dc-check-field' && tab?.id) void injectCard(tab.id)
  if (info.menuItemId === 'dc-scan-page' && tab?.id) void injectPage(tab.id, 'dc-scan-page')
  if (info.menuItemId === 'dc-audit-page' && tab?.id) void injectPage(tab.id, 'dc-audit-page')
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dc-log-purge') {
    void getSettings().then((s) => purgeLog(s.logRetentionDays))
  }
})

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Why retry: the crxjs content-script loader registers its onMessage listener
// via an async dynamic import that isn't finished when executeScript resolves.
// A single immediate sendMessage loses that race on first invocation (the bug
// where the first try silently did nothing and the second worked). We retry
// until the listener answers — null means "not up yet", an object means it did.
async function sendWithRetry<T>(tabId: number, msg: RuntimeMessage): Promise<T | null> {
  for (let i = 0; i < 30; i++) {
    const res = (await chrome.tabs.sendMessage(tabId, msg).catch(() => null)) as T | null
    if (res) return res
    await delay(40)
  }
  return null
}

type FocusedIframe = { origin: string; crossOrigin: boolean; isCard: boolean }

// executeScript func: is focus inside an <iframe>, is it cross-origin, and does
// it look like the card-NUMBER field (so we can force the 'card' format)?
function detectFocusedIframe(): FocusedIframe | null {
  const el = document.activeElement as HTMLIFrameElement | null
  if (!el || el.tagName !== 'IFRAME') return null
  let crossOrigin = false
  try { crossOrigin = !el.contentDocument } catch { crossOrigin = true }
  try {
    const hint = `${el.id} ${el.name} ${el.title} ${el.src}`.toLowerCase()
    const isCard = /ccnumber|card.?number|account.?number|\bpan\b|number/.test(hint) &&
      !/\bexp|expir|cvv|cvc|cvn|security.?code/.test(hint)
    return { origin: new URL(el.src).origin, crossOrigin, isCard }
  } catch {
    return null
  }
}

async function injectCard(tabId: number) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScript] })
  } catch {
    return // restricted page (chrome://, web store) — nothing we can do
  }
  const res = await sendWithRetry<{ mounted: boolean }>(tabId, { kind: 'dc-activate' })
  if (res?.mounted) return
  // top frame had no reachable field — the focus may be inside a subframe. Don't
  // mount inside the frame (a payment iframe is ~50px tall and would clip the
  // card); instead read the value out and render the card in the TOP frame.
  let info: FocusedIframe | null = null
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: detectFocusedIframe })
    info = (r?.result as FocusedIframe | null) ?? null
  } catch {
    return
  }
  if (!info) return // nothing focused / not an iframe — do nothing, as before
  const fmt = info.isCard ? 'card' : undefined
  if (!info.crossOrigin) {
    await verifyIframe(tabId, fmt) // same-origin subframe — always readable
    return
  }
  // cross-origin: only proceed if the user already granted this origin. The
  // first grant must come from the popup (content/SW can't call
  // permissions.request), so point the user there with an on-page hint.
  if (await chrome.permissions.contains({ origins: [`${info.origin}/*`] })) {
    await verifyIframe(tabId, fmt)
  } else {
    await sendWithRetry(tabId, { kind: 'dc-sealed-hint', host: new URL(info.origin).host })
  }
}

// Solution B: the user granted per-host access to a cross-origin frame holding
// a sealed field (e.g. a card number in a payment iframe). Read that field's
// value from whichever now-permitted frame has focus, then open the verify card
// in the top frame. The value is relayed locally only — never stored, never
// sent to the network. See RuntimeMessage note on dc-open-with-value.
async function verifyIframe(tabId: number, format?: string) {
  let value: string | null = null
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      // Read the FOCUSED element first — processors like CollectJS use custom
      // fields that querySelectorAll('input') misses but activeElement catches
      // (per-frame activeElement persists even when top-frame focus moves). Only
      // accept a card-number-shaped value (12–19 digits) so we never grab a
      // giant hidden token/state input by mistake.
      func: () => {
        const cardish = (s: string | null | undefined) => {
          const d = (s || '').replace(/\D/g, '')
          return d.length >= 12 && d.length <= 19
        }
        const ae = document.activeElement as HTMLInputElement | null
        if (ae && typeof ae.value === 'string' && cardish(ae.value)) return ae.value
        for (const e of Array.from(document.querySelectorAll('input, textarea'))) {
          const v = (e as HTMLInputElement).value
          if (cardish(v)) return v
        }
        return null
      },
    })
    // the sealed field is in a sub-frame — skip the TOP frame, whose own hidden
    // inputs (checkout tokens, CSRF, page state) can be card-shaped by accident
    value = results
      .filter((r) => r.frameId !== 0)
      .map((r) => r.result as string | null)
      .find((v): v is string => typeof v === 'string' && v.trim().length > 0) ?? null
  } catch {
    /* the granted frame may not be readable — fall through to input mode */
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScript] })
  } catch {
    return // restricted page
  }
  await sendWithRetry(tabId, { kind: 'dc-open-with-value', value, format })
}

async function injectPage(tabId: number, kind: 'dc-scan-page' | 'dc-audit-page') {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScript] })
  } catch {
    return // restricted page — can't scan
  }
  await sendWithRetry(tabId, { kind })
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'check-field' && tab?.id) void injectCard(tab.id)
})

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('src/offscreen/index.html'),
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification:
      'Runs the bundled Tesseract OCR engine in a web worker so images are read locally and never uploaded.',
  })
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.kind === 'dc-activate-from-popup' && typeof msg.tabId === 'number') {
    void injectCard(msg.tabId).then(() => sendResponse({ ok: true }))
    return true // async response
  }
  if (msg?.kind === 'dc-scan-from-popup' && typeof msg.tabId === 'number') {
    void injectPage(msg.tabId, 'dc-scan-page').then(() => sendResponse({ ok: true }))
    return true // async response
  }
  if (msg?.kind === 'dc-verify-iframe' && typeof msg.tabId === 'number') {
    void verifyIframe(msg.tabId, msg.format).then(() => sendResponse({ ok: true }))
    return true // async response
  }
  // a scan pill on a sealed card field was clicked (sender is the page)
  if (msg?.kind === 'dc-pill-iframe' && typeof msg.origin === 'string') {
    const tabId = sender.tab?.id
    if (tabId == null) { sendResponse({ ok: false }); return }
    void (async () => {
      if (await chrome.permissions.contains({ origins: [`${msg.origin}/*`] })) {
        await verifyIframe(tabId, 'card') // pill only fires for card-number frames

      } else {
        // first grant can only come from an extension page — open the popup so
        // its Grant-access button is one tap away; fall back to an on-page hint
        // if the browser won't open the popup programmatically
        try {
          await chrome.action.openPopup()
        } catch {
          await sendWithRetry(tabId, { kind: 'dc-sealed-hint', host: new URL(msg.origin).host })
        }
      }
      sendResponse({ ok: true })
    })()
    return true
  }
  if (msg?.kind === 'dc-ocr' && typeof msg.imageDataUrl === 'string') {
    // relay content → offscreen; the image stays inside the extension process
    void (async () => {
      try {
        await ensureOffscreen()
        const res = await chrome.runtime.sendMessage({ kind: 'dc-ocr-run', imageDataUrl: msg.imageDataUrl })
        sendResponse(res ?? { ok: false, error: 'no OCR response' })
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : 'OCR unavailable' })
      }
    })()
    return true
  }
  if (msg?.kind === 'dc-open-options') {
    void chrome.runtime.openOptionsPage()
    sendResponse({ ok: true })
  }
  if (msg?.kind === 'dc-open-mic-setup') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/mic/index.html') })
    sendResponse({ ok: true })
  }
  if (msg?.kind === 'dc-open-help') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') + '#help' })
    sendResponse({ ok: true })
  }
  if (msg?.kind === 'dc-license-status') {
    void getLicenseStatus().then(sendResponse)
    return true
  }
  if (msg?.kind === 'dc-payment-action' && typeof msg.action === 'string') {
    void handlePaymentAction(msg.action).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }))
    return true
  }
})
