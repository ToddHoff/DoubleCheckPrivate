// On-device OCR. Everything is bundled (worker, WASM cores, traineddata) —
// no network request can occur, and the image is discarded after extraction.
import { createWorker, type Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker('eng', 1, {
    workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('tesseract'),
    langPath: chrome.runtime.getURL('tesseract'),
    gzip: false,
    // Why: MV3 extension-page CSP has no worker-src for blob:, so tesseract's
    // default blob-URL worker wrapper is blocked. Load worker.min.js directly.
    workerBlobURL: false,
  })
  return workerPromise
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.kind !== 'dc-ocr-run') return
  void (async () => {
    try {
      const worker = await getWorker()
      const { data } = await worker.recognize(msg.imageDataUrl)
      sendResponse({ ok: true, text: data.text })
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : 'OCR failed' })
    }
  })()
  return true
})
