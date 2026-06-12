// Generates Chrome Web Store assets into store-assets/:
//   screenshot-1..5.jpg (1280x800), small-tile.jpg (440x280), marquee.jpg (1400x560)
// Screenshots are the REAL product driven in Chromium. The extension build is
// copied and given <all_urls> ONLY for this staging session (the shortcut's
// activeTab gesture can't be simulated); dist-shots/ is never shipped.
import { chromium } from '@playwright/test'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'

mkdirSync('store-assets', { recursive: true })

// ---------- promo tiles ----------
const LOGO = `
  <div style="width:VARpx;height:VARpx;border-radius:22%;background:#fff;display:flex;
              align-items:center;justify-content:center;flex:none">
    <svg viewBox="0 0 100 100" width="72%" height="72%">
      <path d="M22 56 L40 74 L85 32" fill="none" stroke="#4ade80" stroke-width="13"
            stroke-linecap="round" stroke-linejoin="round" transform="translate(7,0)"/>
      <path d="M22 56 L40 74 L85 32" fill="none" stroke="#166534" stroke-width="13"
            stroke-linecap="round" stroke-linejoin="round" transform="translate(-5,0)"/>
    </svg>
  </div>`

const tileHtml = (w, h, scale) => `<!doctype html><html><body style="margin:0">
  <div style="width:${w}px;height:${h}px;background:linear-gradient(135deg,#14532d,#166534);
              display:flex;align-items:center;justify-content:center;gap:${24 * scale}px;
              font-family:system-ui,-apple-system,sans-serif;box-sizing:border-box;padding:${20 * scale}px">
    ${LOGO.replace(/VAR/g, String(Math.round(96 * scale)))}
    <div style="color:#fff">
      <div style="font-size:${38 * scale}px;font-weight:800;letter-spacing:-.5px">Double Check</div>
      <div style="font-size:${17 * scale}px;color:#bbf7d0;margin-top:${6 * scale}px;max-width:${260 * scale}px;line-height:1.35">
        A second pair of eyes for numbers that can’t be wrong</div>
      ${scale > 1 ? `<div style="display:flex;gap:10px;margin-top:22px">
        ${['Real checksum math', 'On-device OCR & voice', 'Nothing leaves your device']
          .map((t) => `<span style="font-size:15px;font-weight:600;background:rgba(255,255,255,.14);
            border:1px solid rgba(255,255,255,.35);border-radius:9999px;padding:6px 14px">${t}</span>`).join('')}
      </div>` : ''}
    </div>
  </div></body></html>`

// ---------- screenshot staging ----------
const ROUTING_OK = '021000021'

async function main() {
  // staging build with host permissions (screenshot session only)
  rmSync('dist-shots', { recursive: true, force: true })
  cpSync('dist', 'dist-shots', { recursive: true })
  const manifest = JSON.parse(readFileSync('dist-shots/manifest.json', 'utf8'))
  manifest.host_permissions = ['<all_urls>']
  writeFileSync('dist-shots/manifest.json', JSON.stringify(manifest, null, 2))
  // inject the crxjs LOADER (what the real background injects) — the raw ES
  // module can't run as a classic script
  const contentScriptFile =
    'assets/' + readdirSync('dist-shots/assets').find((f) => /^index\.ts-loader-/.test(f))

  const server = http.createServer((req, res) => {
    try {
      const file = path.join('tests/pages', path.basename(req.url || '/plain.html') || 'plain.html')
      res.setHeader('content-type', 'text/html')
      res.end(readFileSync(file))
    } catch {
      res.statusCode = 404
      res.end()
    }
  })
  await new Promise((r) => server.listen(8923, r))

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    args: ['--disable-extensions-except=dist-shots', '--load-extension=dist-shots'],
  })
  let [worker] = context.serviceWorkers()
  worker ??= await context.waitForEvent('serviceworker')
  const extId = new URL(worker.url()).host

  // tiles (rendered in the same browser)
  const tilePage = await context.newPage()
  for (const [name, w, h, scale] of [['small-tile.jpg', 440, 280, 1], ['marquee.jpg', 1400, 560, 1.9]]) {
    await tilePage.setViewportSize({ width: w, height: h })
    await tilePage.setContent(tileHtml(w, h, scale))
    await tilePage.screenshot({ path: `store-assets/${name}`, type: 'jpeg', quality: 92 })
    console.log(name)
  }
  await tilePage.close()

  // unlock paid features via the dev override (unpacked build honors it)
  await worker.evaluate(() => chrome.storage.local.set({ 'dc:devLicense': true }))

  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE CONSOLE:', m.text()) })
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))
  await page.goto('http://localhost:8923/plain.html')

  const tabId = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://localhost:8923/*' })
    return tab.id
  })
  const openCard = async () => {
    const result = await worker.evaluate(
      async ({ tabId, file }) => {
        const exec = await chrome.scripting.executeScript({ target: { tabId }, files: [file] })
        // the crxjs loader registers listeners via async dynamic import —
        // retry the activate message until the listener exists
        for (let i = 0; i < 20; i++) {
          try {
            const res = await chrome.tabs.sendMessage(tabId, { kind: 'dc-activate' })
            return { ok: true, mounted: res?.mounted, attempts: i + 1 }
          } catch {
            await new Promise((r) => setTimeout(r, 100))
          }
        }
        return { ok: false, exec: JSON.stringify(exec) }
      },
      { tabId, file: contentScriptFile },
    )
    if (!result.ok) throw new Error(`activate never connected; exec=${result.exec}`)
  }
  // state:'attached' — the host element is zero-size (the card renders in a
  // fixed-position shadow root), so the default visibility wait never fires
  const waitStep = (step) =>
    page.waitForSelector(`[data-double-check][data-dc-step="${step}"]`, { timeout: 8000, state: 'attached' })
  const shot = async (n) => {
    await page.screenshot({ path: `store-assets/screenshot-${n}.jpg`, type: 'jpeg', quality: 92 })
    console.log(`screenshot-${n}.jpg`)
  }

  // click the card's entry input by geometry: the card sits 8px under the
  // field, the entry input ~100px into it — hit-testing pierces the shadow
  const clickEntry = async (fieldSel, offsetY = 100, offsetX = 200) => {
    const b = await page.locator(fieldSel).boundingBox()
    await page.mouse.click(b.x + offsetX, b.y + b.height + 8 + offsetY)
  }

  // 1: verify mode on the pre-filled routing number — instant checksum chip
  await page.click('#routing')
  await openCard()
  await waitStep('verify-entry')
  await page.waitForTimeout(300) // entry input autofocus settles
  await shot(1)

  // 2: transposition caught — re-type with the last two digits swapped
  await clickEntry('#routing', 147) // below the chips row, into the entry input
  await page.keyboard.type(ROUTING_OK.slice(0, 7) + '12', { delay: 30 })
  await clickEntry('#routing', 243, 145) // the Compare button
  await waitStep('mismatch')
  await page.waitForTimeout(200)
  await shot(2)
  await page.keyboard.press('Escape')

  // 3: amount match — big green value + amount in words
  await page.click('#amount')
  await openCard()
  await waitStep('input-first')
  await page.waitForTimeout(300)
  await clickEntry('#amount', 95)
  await page.keyboard.type('$1,234,567.89', { delay: 20 })
  await page.keyboard.press('Enter')
  await waitStep('input-confirm')
  await page.waitForTimeout(200)
  await clickEntry('#amount', 95)
  await page.keyboard.type('$1,234,567.89', { delay: 20 })
  await page.keyboard.press('Enter')
  await waitStep('match')
  await page.waitForTimeout(200)
  await shot(3)

  // attest so the badge + a log entry exist
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2200) // card auto-closes, badge remains

  // 4: input mode with the full assist row (scan / paste / speak) + badge visible above
  await page.click('#account')
  await openCard()
  await waitStep('input-first')
  await page.waitForTimeout(300)
  await shot(4)
  await page.keyboard.press('Escape')

  // 5: the audit log — proof without the value
  const options = await context.newPage()
  await options.setViewportSize({ width: 1280, height: 800 })
  await options.goto(`chrome-extension://${extId}/src/options/index.html#log`)
  await options.waitForTimeout(400)
  await options.screenshot({ path: 'store-assets/screenshot-5.jpg', type: 'jpeg', quality: 92 })
  console.log('screenshot-5.jpg')

  await context.close()
  server.close()
  rmSync('dist-shots', { recursive: true, force: true })
  console.log('done — staging build removed')
}

await main()
