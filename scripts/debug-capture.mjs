// Diagnostic: can the service worker captureVisibleTab when the visible tab
// is (a) the extension's own onboarding page, with no activeTab grant?
import { chromium } from '@playwright/test'

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: ['--disable-extensions-except=dist', '--load-extension=dist'],
})
let [worker] = context.serviceWorkers()
worker ??= await context.waitForEvent('serviceworker')
const id = new URL(worker.url()).host

const page = await context.newPage()
await page.goto(`chrome-extension://${id}/src/onboarding/index.html`)
await page.waitForTimeout(300)

const result = await worker.evaluate(async () => {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
    return { ok: true, length: dataUrl.length }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
})
console.log('capture own extension page:', JSON.stringify(result))
await context.close()
