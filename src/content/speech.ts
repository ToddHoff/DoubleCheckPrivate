import type { Validator } from '../engine'
import { groupValue } from '../engine'

// Why speechSynthesis and not chrome.tts: this runs inside the content
// script, so the value never crosses to the service worker, and the
// extension needs no "tts" permission. localService-only voices keep the
// text on-device — a remote voice would silently exfiltrate it, so if no
// local voice exists we stay silent rather than fall back.

// Why the cache + voiceschanged dance: Chrome's getVoices() returns []
// until the voice inventory loads asynchronously. Checking it once at
// render time hides the feature on machines that have plenty of voices.
let voices: SpeechSynthesisVoice[] = []

function refreshVoices(): void {
  voices = window.speechSynthesis?.getVoices() ?? []
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  refreshVoices()
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
}

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis
}

async function getLocalVoice(): Promise<SpeechSynthesisVoice | null> {
  refreshVoices()
  if (!voices.length) {
    // voice list still loading — wait for it (bounded)
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1500)
      window.speechSynthesis.addEventListener(
        'voiceschanged',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })
    refreshVoices()
  }
  return voices.find((v) => v.localService && v.default) ?? voices.find((v) => v.localService) ?? null
}

/** speak the value with a LOCAL voice only; resolves false if none exists */
export async function speakValue(normalized: string, validator: Validator): Promise<boolean> {
  const voice = await getLocalVoice()
  if (!voice) return false
  window.speechSynthesis.cancel()
  let text: string
  if (validator.speech === 'natural') {
    text = validator.format ? validator.format(normalized) : normalized
  } else {
    // char-by-char with pauses at group boundaries: "0 2 1, 0 0 0, 0 2 1"
    text = groupValue(normalized, validator.grouping ?? [3])
      .split(' ')
      .map((g) => [...g].join(' '))
      .join(', ')
  }
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.rate = 0.8
  window.speechSynthesis.speak(u)
  return true
}

export function stopSpeaking(): void {
  window.speechSynthesis?.cancel()
}
