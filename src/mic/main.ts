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
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      // embedded extension iframes can't prompt — needs the one-time grant
      // from the top-level setup page (this same page, opened directly)
      status('denied', 'Microphone access is blocked for Double Check')
    } else {
      status('error', e.error === 'no-speech'
        ? 'Didn’t hear anything — try again'
        : `Speech recognition error: ${e.error}`)
    }
  }
  rec.onend = () => {
    if (active === rec) active = null
    status('ended')
  }
  status('listening')
  rec.start()
}

if (nonce) {
  // embedded mode: driven by the card via runtime messages
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.nonce !== nonce) return
    if (msg.kind === 'dc-voice-start') void start(typeof msg.lang === 'string' ? msg.lang : 'en-US')
    if (msg.kind === 'dc-voice-stop') {
      active?.stop()
      active = null
    }
  })
} else {
  // top-level setup mode: grant the mic permission to the extension origin
  // once, so the embedded card iframe can use it without prompting
  setupMode()
}

function setupMode(): void {
  document.body.style.cssText = 'font:16px/1.6 system-ui,sans-serif;color:#1f2937;max-width:560px;margin:60px auto;padding:0 20px'
  const heading = document.createElement('h1')
  heading.textContent = 'Enable voice input'
  const explain = document.createElement('p')
  explain.textContent =
    'Double Check needs one-time microphone access to let you read values aloud. ' +
    'Recognition runs entirely on this device — audio and transcripts never leave your computer.'
  const button = document.createElement('button')
  button.textContent = 'Enable microphone'
  button.style.cssText = 'padding:10px 18px;border-radius:9px;border:0;background:#166534;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer'
  const out = document.createElement('p')
  const setOut = (t: string) => { out.textContent = t }
  button.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const track of stream.getTracks()) track.stop()
      setOut('Microphone enabled. Preparing on-device speech recognition…')
      const Ctor = ((window as never as Record<string, unknown>).SpeechRecognition ??
        (window as never as Record<string, unknown>).webkitSpeechRecognition) as SR | undefined
      if (Ctor && typeof Ctor.available === 'function' && typeof Ctor.install === 'function') {
        const availability = await Ctor.available({ langs: ['en-US'], processLocally: true })
        if (availability === 'available') {
          setOut('All set — close this tab and click “Speak it” again.')
        } else if (availability === 'unavailable') {
          setOut('Microphone enabled, but this Chrome can’t do on-device speech recognition for English.')
        } else {
          setOut('Microphone enabled. Downloading the on-device speech model (one time)…')
          const ok = await Ctor.install({ langs: ['en-US'], processLocally: true })
          setOut(ok
            ? 'All set — close this tab and click “Speak it” again.'
            : 'Microphone enabled, but the speech model couldn’t be installed.')
        }
      } else {
        setOut('Microphone enabled, but this Chrome version has no on-device speech recognition (needs Chrome 139+).')
      }
    } catch {
      setOut(
        'Chrome blocked the request. Click the mic/tune icon in the address bar and allow the microphone, ' +
        'or check chrome://settings/content/microphone. On a Mac, also confirm Chrome itself is allowed under ' +
        'System Settings → Privacy & Security → Microphone, then try again.')
    }
  })
  document.body.append(heading, explain, button, out)
}
