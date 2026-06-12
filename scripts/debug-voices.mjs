// One-off diagnostic: what does speechSynthesis report inside the
// extension's own onboarding page on this machine?
import { chromium } from '@playwright/test'

const headless = process.argv[2] !== 'headed'

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless,
  args: ['--disable-extensions-except=dist', '--load-extension=dist'],
})
let [worker] = context.serviceWorkers()
worker ??= await context.waitForEvent('serviceworker')
const id = new URL(worker.url()).host

const page = await context.newPage()
await page.goto(`chrome-extension://${id}/src/onboarding/index.html`)

const report = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const snap = () => ({
        hasApi: !!window.speechSynthesis,
        count: speechSynthesis.getVoices().length,
        voices: speechSynthesis
          .getVoices()
          .slice(0, 12)
          .map((v) => ({ name: v.name, local: v.localService, default: v.default })),
      })
      const first = snap()
      if (first.count) return resolve({ immediate: true, ...first })
      speechSynthesis.addEventListener('voiceschanged', () => resolve({ immediate: false, ...snap() }), { once: true })
      setTimeout(() => resolve({ immediate: false, timedOut: true, ...snap() }), 4000)
    }),
)
console.log(`headless=${headless}`)
console.log(JSON.stringify(report, null, 2))
await context.close()
