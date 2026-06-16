import contentScript from '../content/index?script'
import { getSettings, purgeLog } from '../shared/storage'
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
async function sendWithRetry<T>(tabId: number, msg: { kind: string }): Promise<T | null> {
  for (let i = 0; i < 30; i++) {
    const res = (await chrome.tabs.sendMessage(tabId, msg).catch(() => null)) as T | null
    if (res) return res
    await delay(40)
  }
  return null
}

async function injectCard(tabId: number) {
  // Why: top frame first; if the focused field lives in a subframe the top
  // instance reports "not here" and we retry allFrames (cross-origin frames
  // that activeTab can't reach are skipped by Chrome, not fatal).
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScript] })
  } catch {
    return // restricted page (chrome://, web store) — nothing we can do
  }
  const res = await sendWithRetry<{ mounted: boolean }>(tabId, { kind: 'dc-activate' })
  if (res?.mounted) return
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [contentScript],
    })
    await sendWithRetry(tabId, { kind: 'dc-activate' })
  } catch {
    /* subframes unreachable under activeTab — top-frame card already offered */
  }
}

async function injectStandalone(tabId: number) {
  // top frame only — the standalone card isn't tied to any field, so there's no
  // subframe to chase; this works even when the focused field is unreachable
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScript] })
  } catch {
    return // restricted page (chrome://, web store) — nothing we can do
  }
  await sendWithRetry(tabId, { kind: 'dc-activate-standalone' })
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.kind === 'dc-activate-from-popup' && typeof msg.tabId === 'number') {
    void injectCard(msg.tabId).then(() => sendResponse({ ok: true }))
    return true // async response
  }
  if (msg?.kind === 'dc-verify-standalone' && typeof msg.tabId === 'number') {
    void injectStandalone(msg.tabId).then(() => sendResponse({ ok: true }))
    return true // async response
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
