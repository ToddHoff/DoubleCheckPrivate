import type { Validator } from '../engine'
import { groupValue } from '../engine'

// Why speechSynthesis and not chrome.tts: this runs inside the content
// script, so the value never crosses to the service worker, and the
// extension needs no "tts" permission. localService-only voices keep the
// text on-device — a remote voice would silently exfiltrate it.

export function localVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? []
  return voices.find((v) => v.localService && v.default) ?? voices.find((v) => v.localService) ?? null
}

export function canSpeakLocally(): boolean {
  return localVoice() !== null
}

export function speakValue(normalized: string, validator: Validator): void {
  const voice = localVoice()
  if (!voice) return
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
}

export function stopSpeaking(): void {
  window.speechSynthesis?.cancel()
}
