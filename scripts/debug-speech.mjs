// Diagnostic: what does on-device SpeechRecognition report in (a) a
// top-level extension page and (b) the mic iframe embedded in a web page?
// Also: is there a permissions-policy feature gating it?
import { chromium } from '@playwright/test'
import http from 'node:http'

const server = http.createServer((_req, res) => {
  res.setHeader('content-type', 'text/html')
  res.end('<!doctype html><title>host</title><input id="f">')
})
await new Promise((r) => server.listen(8917, r))

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: ['--disable-extensions-except=dist', '--load-extension=dist'],
})
let [worker] = context.serviceWorkers()
worker ??= await context.waitForEvent('serviceworker')
const id = new URL(worker.url()).host

const probe = `(async () => {
  const Ctor = self.SpeechRecognition ?? self.webkitSpeechRecognition
  const out = {
    hasCtor: !!Ctor,
    hasAvailable: !!Ctor && typeof Ctor.available === 'function',
    hasInstall: !!Ctor && typeof Ctor.install === 'function',
    policyFeatures: (document.featurePolicy?.features() ?? []).filter((f) => /speech|device/i.test(f)),
  }
  if (out.hasAvailable) {
    try { out.localAvail = await Ctor.available({ langs: ['en-US'], processLocally: true }) }
    catch (e) { out.localAvailError = String(e) }
    try { out.cloudAvail = await Ctor.available({ langs: ['en-US'], processLocally: false }) }
    catch (e) { out.cloudAvailError = String(e) }
  }
  return out
})()`

// (a) top-level extension page
const top = await context.newPage()
await top.goto(`chrome-extension://${id}/src/mic/index.html`)
console.log('TOP-LEVEL extension page:', JSON.stringify(await top.evaluate(probe)))

// (b) mic iframe embedded in a plain http page
const host = await context.newPage()
await host.goto('http://localhost:8917/')
const result = await host.evaluate(async (src) => {
  const iframe = document.createElement('iframe')
  iframe.src = src
  iframe.setAttribute('allow', 'microphone; on-device-speech-recognition')
  document.body.appendChild(iframe)
  await new Promise((r) => iframe.addEventListener('load', r))
  return 'loaded (cannot evaluate cross-origin from here)'
}, `chrome-extension://${id}/src/mic/index.html`)
console.log('iframe:', result)
// find the iframe's frame and evaluate inside it
const frame = host.frames().find((f) => f.url().includes('src/mic/index.html'))
if (frame) console.log('EMBEDDED iframe in http page:', JSON.stringify(await frame.evaluate(probe)))

// (c) top-level http page — the context a content script runs in
console.log('TOP-LEVEL http page:', JSON.stringify(await host.evaluate(probe)))

await context.close()
server.close()
