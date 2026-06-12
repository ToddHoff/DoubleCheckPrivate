import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Smoke test: loads the built extension in real Chromium and drives the full
// input-mode flow (enter → blind confirm → attest → log) on the onboarding
// practice form, entirely via keyboard since the card lives in a CLOSED
// shadow root by design. Also the privacy regression: the verified value
// must appear nowhere in extension storage, and no request may leave the
// extension's own origin.

const DIST = fileURLToPath(new URL('../../dist', import.meta.url))
const ROUTING = '021000021'

let context: BrowserContext
let extensionId: string

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  })
  let [worker] = context.serviceWorkers()
  worker ??= await context.waitForEvent('serviceworker')
  extensionId = new URL(worker.url()).host
})

test.afterAll(async () => {
  await context.close()
})

async function settle(page: Page, ms = 250) {
  await page.waitForTimeout(ms)
}

test('full check flow on the practice form, with privacy regression', async () => {
  const page = await context.newPage()

  const externalRequests: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    if (!url.startsWith('chrome-extension://') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      externalRequests.push(url)
    }
  })

  await page.goto(`chrome-extension://${extensionId}/src/onboarding/index.html`)
  await expect(page.locator('h1')).toHaveText('Double Check')

  // mount the card on the empty practice field → input mode
  await page.getByRole('button', { name: 'Open Double Check on this field' }).click()
  await expect(page.locator('[data-double-check]')).toHaveCount(1)
  await settle(page) // async context load → entry input autofocus

  // step 1: type the value from the "source"
  await page.keyboard.type(ROUTING)
  await settle(page, 150)
  await page.keyboard.press('Enter')
  await settle(page)

  // step 2: blind re-type
  await page.keyboard.type(ROUTING)
  await page.keyboard.press('Enter')
  await settle(page)

  // match state writes the value into the practice field
  await expect(page.locator('#practice')).toHaveValue(ROUTING)

  // attest: checkbox is focused → Space, then Tab to the confirm button → Enter
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await settle(page, 400)

  // verified badge appears next to the field
  await expect(page.locator('[data-double-check-badge]')).toHaveCount(1)

  // the log has exactly one attested aba-routing entry — and NO value
  const stored = await page.evaluate(() => chrome.storage.local.get(null))
  const log = (stored['dc:log'] ?? []) as Array<Record<string, unknown>>
  expect(log).toHaveLength(1)
  expect(log[0]).toMatchObject({
    format: 'aba-routing',
    attested: true,
    result: 'match',
    valueLength: 9,
  })
  expect(log[0].fingerprint).toBeUndefined() // off by default
  expect(JSON.stringify(stored)).not.toContain(ROUTING)

  // tamper watch: editing the field flips the badge to a warning and marks the entry stale
  await page.locator('#practice').fill('021000022')
  await settle(page, 300)
  const stale = await page.evaluate(() => chrome.storage.local.get('dc:log'))
  expect((stale['dc:log'] as Array<Record<string, unknown>>)[0].stale).toBe(true)

  // privacy: nothing left the machine
  expect(externalRequests).toEqual([])
})

test('mismatch is caught and nothing is logged', async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/onboarding/index.html`)
  await page.evaluate(() => chrome.storage.local.remove('dc:log'))
  await page.getByRole('button', { name: 'Open Double Check on this field' }).click()
  await expect(page.locator('[data-double-check]')).toHaveCount(1)
  await settle(page)

  await page.keyboard.type(ROUTING)
  await settle(page, 150)
  await page.keyboard.press('Enter')
  await settle(page)
  await page.keyboard.type('021000012') // transposed last digits
  await page.keyboard.press('Enter')
  await settle(page)

  // mismatch → nothing logged, field still empty
  await expect(page.locator('#practice')).toHaveValue('')
  const stored = await page.evaluate(() => chrome.storage.local.get('dc:log'))
  expect(stored['dc:log'] ?? []).toHaveLength(0)
})
