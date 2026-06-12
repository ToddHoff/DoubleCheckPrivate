// Voice input setup page (always opened top-level). Two jobs:
// 1. Grant the extension-origin mic permission — needed for voice input on
//    Double Check's own pages, like the practice form.
// 2. Pre-download Chrome's on-device speech model (browser-wide), so the
//    first real "Speak it" doesn't stall on a model download.
//
// During checks on regular websites, recognition runs in the page itself
// (Chrome forbids speech recognition in cross-origin iframes), so the mic
// prompt there names the website — see src/content/voice-rec.ts.

export {}

type SR = {
  available?: (opts: { langs: string[]; processLocally: boolean }) => Promise<string>
  install?: (opts: { langs: string[]; processLocally: boolean }) => Promise<boolean>
}

document.body.style.cssText =
  'font:16px/1.6 system-ui,sans-serif;color:#1f2937;max-width:560px;margin:60px auto;padding:0 20px'
const heading = document.createElement('h1')
heading.textContent = 'Set up voice input'
const explain = document.createElement('p')
explain.textContent =
  'This enables the microphone for Double Check’s own pages and pre-downloads Chrome’s on-device speech ' +
  'model. Recognition always runs on this device — audio and transcripts never leave your computer. ' +
  'On regular websites, Chrome’s mic prompt names the site you’re on; allow it there on first use.'
const button = document.createElement('button')
button.textContent = 'Enable microphone & download model'
button.style.cssText =
  'padding:10px 18px;border-radius:9px;border:0;background:#166534;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer'
const out = document.createElement('p')
const setOut = (t: string) => { out.textContent = t }

button.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
    setOut('Microphone enabled. Checking on-device speech recognition…')
  } catch {
    setOut(
      'Chrome blocked the request. Click the mic/tune icon in the address bar and allow the microphone, ' +
      'or check chrome://settings/content/microphone. On a Mac, also confirm Chrome itself is allowed under ' +
      'System Settings → Privacy & Security → Microphone, then try again.')
    return
  }
  const Ctor = ((window as never as Record<string, unknown>).SpeechRecognition ??
    (window as never as Record<string, unknown>).webkitSpeechRecognition) as SR | undefined
  if (!Ctor || typeof Ctor.available !== 'function' || typeof Ctor.install !== 'function') {
    setOut('Microphone enabled, but this Chrome version has no on-device speech recognition (needs Chrome 139+).')
    return
  }
  const availability = await Ctor.available({ langs: ['en-US'], processLocally: true })
  if (availability === 'available') {
    setOut('All set — the speech model is already installed. Close this tab and click “Speak it”.')
  } else if (availability === 'unavailable') {
    setOut('Microphone enabled, but this Chrome can’t do on-device speech recognition for English.')
  } else {
    setOut('Microphone enabled. Downloading the on-device speech model (one time)…')
    const ok = await Ctor.install({ langs: ['en-US'], processLocally: true })
    setOut(ok
      ? 'All set — close this tab and click “Speak it”.'
      : 'Microphone enabled, but the speech model couldn’t be installed.')
  }
})

document.body.append(heading, explain, button, out)
