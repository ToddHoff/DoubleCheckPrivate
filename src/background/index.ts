import contentScript from '../content/index?script'
import { getSettings, purgeLog } from '../shared/storage'
import { getLicenseStatus, handlePaymentAction, startLicensing } from './license'

startLicensing()

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })
  }
  void chrome.alarms.create('dc-log-purge', { periodInMinutes: 60 * 24 })
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dc-log-purge') {
    void getSettings().then((s) => purgeLog(s.logRetentionDays))
  }
})

async function injectCard(tabId: number) {
  // Why: top frame first; if the focused field lives in a subframe the top
  // instance reports "not here" and we retry allFrames (cross-origin frames
  // that activeTab can't reach are skipped by Chrome, not fatal).
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScript] })
  } catch {
    return // restricted page (chrome://, web store) — nothing we can do
  }
  const res = await chrome.tabs.sendMessage(tabId, { kind: 'dc-activate' }).catch(() => null)
  if (res?.mounted) return
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [contentScript],
    })
    await chrome.tabs.sendMessage(tabId, { kind: 'dc-activate' }).catch(() => null)
  } catch {
    /* subframes unreachable under activeTab — top-frame card already offered */
  }
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
  if (msg?.kind === 'dc-capture-visible-tab') {
    void (async () => {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT, {
          format: 'png',
        })
        sendResponse({ ok: true, dataUrl })
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : 'capture failed' })
      }
    })()
    return true
  }
  if (msg?.kind === 'dc-open-options') {
    void chrome.runtime.openOptionsPage()
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
