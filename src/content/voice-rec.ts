// On-device speech recognition, run directly in the (top-level) document
// the content script lives in.
//
// Why not an extension iframe: Chrome refuses speech recognition in
// cross-origin iframes outright — even with microphone and
// on-device-speech-recognition delegated, available() reports
// 'unavailable' (verified empirically; see scripts/debug-speech.mjs).
// Running here means the mic prompt names the website, but the transcript
// never leaves this content script — no messaging at all.
//
// Hard privacy rule: processLocally = true or nothing. No cloud fallback.

export interface VoiceCallbacks {
  onStatus(state: 'listening' | 'downloading' | 'unavailable' | 'denied' | 'error' | 'ended', detail?: string): void
  onResult(alternatives: string[]): void
}

interface SpeechRecognitionLike {
  lang: string
  processLocally?: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type SRCtor = {
  new (): SpeechRecognitionLike
  available?: (opts: { langs: string[]; processLocally: boolean }) => Promise<string>
  install?: (opts: { langs: string[]; processLocally: boolean }) => Promise<boolean>
}

function ctor(): SRCtor | undefined {
  const w = window as never as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as SRCtor | undefined
}

let active: SpeechRecognitionLike | null = null

export async function startRecognition(lang: string, cb: VoiceCallbacks): Promise<void> {
  const Ctor = ctor()
  if (!Ctor || typeof Ctor.available !== 'function' || typeof Ctor.install !== 'function') {
    cb.onStatus('unavailable', 'This Chrome version has no on-device speech recognition (needs Chrome 139+)')
    return
  }
  const availability = await Ctor.available({ langs: [lang], processLocally: true })
  if (availability === 'unavailable') {
    cb.onStatus('unavailable', 'On-device speech recognition isn’t available for this language')
    return
  }
  if (availability !== 'available') {
    cb.onStatus('downloading', 'Downloading the on-device speech model (one time)…')
    const ok = await Ctor.install({ langs: [lang], processLocally: true })
    if (!ok) {
      cb.onStatus('unavailable', 'The on-device speech model couldn’t be installed')
      return
    }
  }

  active?.stop()
  const rec = new Ctor()
  active = rec
  rec.lang = lang
  rec.processLocally = true
  rec.interimResults = false
  rec.maxAlternatives = 5
  rec.onresult = (e) => {
    const alternatives: string[] = []
    for (let i = 0; i < e.results.length; i++) {
      const result = e.results[i]
      for (let j = 0; j < result.length; j++) alternatives.push(result[j].transcript)
    }
    cb.onResult(alternatives)
  }
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') cb.onStatus('denied')
    else if (e.error === 'no-speech') cb.onStatus('error', 'Didn’t hear anything — try again')
    else cb.onStatus('error', `Speech recognition error: ${e.error}`)
  }
  rec.onend = () => {
    if (active === rec) active = null
    cb.onStatus('ended')
  }
  cb.onStatus('listening')
  rec.start()
}

export function stopRecognition(): void {
  active?.stop()
  active = null
}
