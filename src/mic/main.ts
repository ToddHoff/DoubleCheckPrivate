// Voice input frame. Runs as a hidden extension-origin iframe inside the
// card so the microphone permission belongs to Double Check, not the page
// the user happens to be on.
//
// Hard privacy rule: recognition runs with processLocally = true or not at
// all. If this Chrome can't do on-device recognition for the language, we
// report 'unavailable' — there is no cloud fallback, ever. Transcripts go
// back over chrome.runtime messaging, which page scripts cannot observe.
//
// The nonce in our URL scopes messages to the card that created us; pages
// can't discover it (the card lives in a closed shadow root) and can't send
// chrome.runtime messages anyway.

export {}

const nonce = new URLSearchParams(location.search).get('nonce')

type SR = {
  new (): SpeechRecognitionLike
  available?: (opts: { langs: string[]; processLocally: boolean }) => Promise<string>
  install?: (opts: { langs: string[]; processLocally: boolean }) => Promise<boolean>
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

// seq lets the receiving card drop duplicates: on extension pages our
// message arrives both directly and via the background's tab relay
let seq = 0

const status = (state: string, detail?: string) =>
  void chrome.runtime.sendMessage({ kind: 'dc-voice-status', nonce, seq: ++seq, state, detail }).catch(() => {})

let active: SpeechRecognitionLike | null = null

async function start(lang: string): Promise<void> {
  const Ctor = ((window as never as Record<string, unknown>).SpeechRecognition ??
    (window as never as Record<string, unknown>).webkitSpeechRecognition) as SR | undefined

  // No on-device API (pre-139 Chrome or no static methods) → unavailable.
  if (!Ctor || typeof Ctor.available !== 'function' || typeof Ctor.install !== 'function') {
    status('unavailable', 'This Chrome version has no on-device speech recognition')
    return
  }
  const availability = await Ctor.available({ langs: [lang], processLocally: true })
  if (availability === 'unavailable') {
    status('unavailable', 'On-device speech recognition isn’t available for this language')
    return
  }
  if (availability !== 'available') {
    status('downloading', 'Downloading the on-device speech model (one time)…')
    const ok = await Ctor.install({ langs: [lang], processLocally: true })
    if (!ok) {
      status('unavailable', 'The on-device speech model couldn’t be installed')
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
    void chrome.runtime.sendMessage({ kind: 'dc-voice-result', nonce, seq: ++seq, alternatives }).catch(() => {})
  }
  rec.onerror = (e) => {
    status('error', e.error === 'not-allowed'
      ? 'Microphone access was denied'
      : e.error === 'no-speech'
        ? 'Didn’t hear anything — try again'
        : `Speech recognition error: ${e.error}`)
  }
  rec.onend = () => {
    if (active === rec) active = null
    status('ended')
  }
  status('listening')
  rec.start()
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.nonce !== nonce) return
  if (msg.kind === 'dc-voice-start') void start(typeof msg.lang === 'string' ? msg.lang : 'en-US')
  if (msg.kind === 'dc-voice-stop') {
    active?.stop()
    active = null
  }
})
