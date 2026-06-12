import type { Diagnosis, ValidationResult, Validator } from '../engine'
import { diagnose, extractCandidates, groupValue, normalizeSpoken, validate } from '../engine'
import { cropToRegion, fileToDataUrl, selectRegion } from './capture'
import type { LicenseStatus, LogEntry, Settings } from '../shared/types'
import {
  appendLogEntry, bumpStats, fingerprintValue, getTtsRate, markLogEntryStale,
  rememberFormat, saveTtsRate, TTS_RATES,
} from '../shared/storage'
import { CARD_CSS } from './styles'
import { speakValue, speechAvailable, stopSpeaking } from './speech'
import {
  attachBadge, fieldDescription, fieldSignature, writeFieldValue,
  type BadgeHandle, type CheckableField,
} from './field'
import { markTampered, markVerified } from './submit-guard'

export interface CardContext {
  validators: Validator[]
  suggestions: string[]
  remembered?: string
  settings: Settings
  license: LicenseStatus
}

type Step = 'verify-entry' | 'input-first' | 'input-confirm' | 'match' | 'mismatch' | 'done'

let current: { destroy(): void; field: CheckableField } | null = null
const badges = new WeakMap<CheckableField, BadgeHandle>()

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.append(...children)
  return el
}

export function isCardMounted(field: CheckableField): boolean {
  return current?.field === field
}

export function mountCard(field: CheckableField, ctx: CardContext): void {
  current?.destroy()

  const host = document.createElement('div')
  host.setAttribute('data-double-check', '')
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = CARD_CSS
  root.appendChild(style)

  const card = h('div', { class: 'card', role: 'dialog', 'aria-label': 'Double Check' })
  root.appendChild(card)
  document.documentElement.appendChild(host)

  // ---- state ----
  const startedAt = Date.now()
  let step: Step = field.value.trim() ? 'verify-entry' : 'input-first'
  let inputMode = step === 'input-first'
  // suppress the field listener during our own programmatic writes, or
  // input mode would reset itself the moment it fills the field on match
  let suppressFieldEvents = false
  // don't yank focus into the card while the user is typing in the field
  let focusOnRender = true
  let formatId = ctx.remembered ?? ctx.suggestions[0] ??
    (/^[\d\s().+-]*$/.test(field.value) ? 'generic-number' : 'generic-text')
  let firstEntry = '' // input mode: the value typed from the source
  let lastDiagnosis: Diagnosis | null = null
  let lastEntered = ''
  let mismatchSeen = false
  let usedTts = false
  let usedOcr = false
  let usedVoice = false

  const validator = () =>
    ctx.validators.find((v) => v.id === formatId) ?? ctx.validators.find((v) => v.id === 'generic-text')!

  const writeField = (value: string) => {
    suppressFieldEvents = true
    writeFieldValue(field, value)
    suppressFieldEvents = false
  }

  // react when the user edits the field while the card is open: cleared →
  // input mode, value (re)typed → verify mode, and any in-progress
  // comparison result is stale and restarts
  const onFieldInput = () => {
    if (suppressFieldEvents || step === 'done') return
    const hasValue = !!field.value.trim()
    focusOnRender = false
    if (!hasValue === inputMode && (step === 'verify-entry' || step === 'input-first')) {
      if (step === 'verify-entry') render() // refresh chips for the new value
    } else {
      inputMode = !hasValue
      step = hasValue ? 'verify-entry' : 'input-first'
      firstEntry = ''
      lastDiagnosis = null
      lastEntered = ''
      render()
    }
    focusOnRender = true
  }
  field.addEventListener('input', onFieldInput)

  /** the value being verified: field value in verify mode, first entry in input mode */
  const subjectRaw = () => (inputMode ? firstEntry : field.value)
  const subjectResult = (): ValidationResult => validate(validator(), subjectRaw())

  // ---- header ----
  const select = h('select', { 'aria-label': 'Value format' })
  const renderSelect = () => {
    select.textContent = ''
    const used = new Set<string>()
    const addGroup = (label: string, ids: string[]) => {
      const items = ids.filter((id) => !used.has(id) && ctx.validators.some((v) => v.id === id))
      if (!items.length) return
      const group = h('optgroup', { label })
      for (const id of items) {
        used.add(id)
        const v = ctx.validators.find((x) => x.id === id)!
        const opt = h('option', { value: id }, v.name)
        if (id === formatId) opt.setAttribute('selected', '')
        group.appendChild(opt)
      }
      select.appendChild(group)
    }
    if (ctx.remembered) addGroup('Remembered for this site', [ctx.remembered])
    addGroup('Suggested', ctx.suggestions)
    addGroup('Built-in', ctx.validators.filter((v) => v.builtin).map((v) => v.id))
    addGroup('Custom', ctx.validators.filter((v) => !v.builtin).map((v) => v.id))
  }
  renderSelect()
  select.addEventListener('change', () => {
    formatId = select.value
    step = inputMode ? 'input-first' : 'verify-entry'
    render()
  })

  const closeBtn = h('button', { class: 'close', 'aria-label': 'Close' }, '✕')
  closeBtn.addEventListener('click', () => destroy(true))
  const header = h('div', { class: 'hd' },
    h('span', { class: 'logo', 'aria-hidden': 'true' }),
    h('span', { class: 'title' }, 'Double Check'),
    select, closeBtn,
  )
  const body = h('div', { class: 'bd', 'aria-live': 'polite' })
  const footer = h('div', { class: 'ft' },
    h('span', {}, 'Values never leave this device'),
    (() => {
      const right = h('span', { style: 'display:flex;gap:10px' })
      if (ctx.license.trial) {
        right.append(h('span', {}, `Trial: ${ctx.license.trialDaysLeft}d left`))
      } else if (!ctx.license.active) {
        const up = h('a', {}, 'Upgrade')
        up.addEventListener('click', () =>
          void chrome.runtime.sendMessage({ kind: 'dc-payment-action', action: 'choose-plan' }))
        right.append(up)
      }
      const a = h('a', {}, 'Settings')
      a.addEventListener('click', () => void chrome.runtime.sendMessage({ kind: 'dc-open-options' }))
      right.append(a)
      return right
    })(),
  )
  card.append(header, body, footer)

  // ---- shared view pieces ----
  const chipRow = (r: ValidationResult): HTMLElement => {
    const row = h('div', { class: 'chips' })
    if (r.valid && r.checksumPassed) row.appendChild(h('span', { class: 'chip ok' }, '✓ Checksum valid'))
    else if (r.valid && !r.hasChecksum) row.appendChild(h('span', { class: 'chip ok' }, '✓ Format valid'))
    else if (r.valid) row.appendChild(h('span', { class: 'chip warn' }, 'Format valid — checksum not verifiable'))
    for (const e of r.errors) row.appendChild(h('span', { class: 'chip err' }, `✕ ${e}`))
    for (const w of r.warnings) row.appendChild(h('span', { class: 'chip warn' }, `⚠ ${w}`))
    return row
  }

  const entryInput = (placeholder: string): HTMLInputElement => {
    const input = h('input', {
      class: 'entry', type: 'text', placeholder,
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': placeholder,
    })
    return input
  }

  // per-card, click-to-speak: each read-aloud is an explicit opt-in, so no
  // global setting — the user decides case by case (e.g. not in open offices)
  let ttsRate = 0.75
  void getTtsRate().then((r) => (ttsRate = r))

  const speakButton = (text: () => string): HTMLElement | null => {
    if (!speechAvailable()) return null
    const btn = h('button', { class: 'btn speak', title: 'Read aloud (local voice)' }, '🔊')
    btn.addEventListener('click', () => {
      void speakValue(text(), validator(), ttsRate).then((spoke) => {
        if (spoke) {
          usedTts = true
        } else {
          btn.setAttribute('disabled', '')
          btn.title = 'No local on-device voice available — network voices are never used'
        }
      })
    })
    const rateLabel = () => TTS_RATES.find((r) => r.rate === ttsRate)?.label ?? '¾×'
    const rateBtn = h('button', { class: 'btn rate', title: 'Reading speed' }, rateLabel())
    rateBtn.addEventListener('click', () => {
      const i = TTS_RATES.findIndex((r) => r.rate === ttsRate)
      ttsRate = TTS_RATES[(i + 1) % TTS_RATES.length].rate
      rateBtn.textContent = rateLabel()
      void saveTtsRate(ttsRate)
      void speakValue(text(), validator(), ttsRate).then((spoke) => {
        if (spoke) usedTts = true
      })
    })
    return h('span', { style: 'display:flex;gap:4px;flex:none' }, btn, rateBtn)
  }

  const diffView = (d: Diagnosis): HTMLElement => {
    const wrap = h('div', { class: 'diff' })
    const row = (tag: string, key: 'expected' | 'entered', hlTypes: string[]) => {
      const r = h('div', { class: 'row' }, h('span', { class: 'tag' }, tag))
      for (const op of d.diff) {
        const ch = op[key]
        const cls = ch === undefined ? 'c gap' : hlTypes.includes(op.type) ? 'c hl' : 'c'
        r.appendChild(h('span', { class: cls }, ch ?? '·'))
      }
      return r
    }
    wrap.append(
      row(inputMode ? 'First' : 'Field', 'expected', ['sub', 'del']),
      row('Retyped', 'entered', ['sub', 'add']),
    )
    return wrap
  }

  // ---- OCR (scan a region / paste an image — all local) ----
  let activeOcr: ((imageDataUrl: string) => Promise<void>) | null = null

  // ---- voice input (on-device only, via a hidden extension-origin iframe;
  // transcripts come back over chrome.runtime so the page can't see them) ----
  const voiceNonce = crypto.randomUUID()
  let voiceIframe: HTMLIFrameElement | null = null
  let voiceReady = false
  let lastVoiceSeq = 0
  let onVoiceResult: ((alternatives: string[]) => void) | null = null
  let onVoiceStatus: ((state: string, detail?: string) => void) | null = null

  const voiceListener = (msg: {
    kind?: string; nonce?: string; seq?: number; alternatives?: string[]; state?: string; detail?: string
  }) => {
    if (msg?.nonce !== voiceNonce) return
    // on extension pages the iframe's message arrives directly AND via the
    // background relay — the sequence number drops the duplicate
    if (typeof msg.seq === 'number') {
      if (msg.seq <= lastVoiceSeq) return
      lastVoiceSeq = msg.seq
    }
    if (msg.kind === 'dc-voice-result' && Array.isArray(msg.alternatives)) onVoiceResult?.(msg.alternatives)
    if (msg.kind === 'dc-voice-status' && typeof msg.state === 'string') onVoiceStatus?.(msg.state, msg.detail)
  }
  chrome.runtime.onMessage.addListener(voiceListener)

  function startVoice(): void {
    if (!voiceIframe) {
      voiceIframe = document.createElement('iframe')
      voiceIframe.src = `${chrome.runtime.getURL('src/mic/index.html')}?nonce=${voiceNonce}`
      voiceIframe.setAttribute('allow', 'microphone')
      voiceIframe.style.display = 'none'
      voiceIframe.addEventListener('load', () => {
        voiceReady = true
        void chrome.runtime.sendMessage({ kind: 'dc-voice-start', nonce: voiceNonce, lang: 'en-US' }).catch(() => {})
      })
      root.appendChild(voiceIframe)
    } else if (voiceReady) {
      void chrome.runtime.sendMessage({ kind: 'dc-voice-start', nonce: voiceNonce, lang: 'en-US' }).catch(() => {})
    }
  }

  // Without onValue, OCR candidates are compared against the subject value
  // (verify mode / step 2). With onValue, they fill an entry instead
  // (input-mode step 1, where there's nothing to compare against yet).
  function ocrSection(onValue?: (value: string) => void): HTMLElement {
    // paid feature — but expiry degrades, never bricks: double entry above
    // stays fully functional without a license
    if (!ctx.license.active) {
      const up = h('a', { style: 'cursor:pointer;text-decoration:underline' },
        'Image compare (scan/paste) is part of the paid plan — start your free trial')
      up.addEventListener('click', () =>
        void chrome.runtime.sendMessage({ kind: 'dc-payment-action', action: 'trial' }))
      return h('div', { class: 'ocr' }, h('div', { class: 'hint' }, up))
    }
    const wrap = h('div', { class: 'ocr' })
    const status = h('div', { class: 'hint' })
    const cands = h('div', { class: 'chips' })
    const setStatus = (t: string) => { status.textContent = t }

    async function handleText(text: string, source: 'ocr' | 'voice'): Promise<void> {
      const v = validator()
      const { matches, nears } = extractCandidates(text, v)
      cands.textContent = ''
      const useCandidate = (c: string) => {
        if (source === 'voice') usedVoice = true
        else usedOcr = true
        if (onValue) onValue(c)
        else compare(c)
      }
      if (!onValue) {
        const expected = validate(v, subjectRaw()).normalized
        if (matches.includes(expected)) {
          useCandidate(expected)
          return
        }
      }
      if (matches.length === 1) {
        useCandidate(matches[0])
        return
      }
      if (matches.length > 1) {
        setStatus(`Found ${matches.length} possible ${v.name} values — pick the one from your source:`)
        for (const m of matches) {
          const chip = h('button', { class: 'chip warn cand' }, m)
          chip.addEventListener('click', () => useCandidate(m))
          cands.appendChild(chip)
        }
        return
      }
      if (nears.length) {
        setStatus(`Nothing ${source === 'voice' ? 'heard' : 'in the image'} passes ${v.name} validation. Close-but-failing reads:`)
        for (const n of nears) {
          const chip = h('button', { class: 'chip err cand' }, n)
          chip.addEventListener('click', () => useCandidate(n))
          cands.appendChild(chip)
        }
        return
      }
      setStatus(source === 'voice'
        ? `Couldn’t hear a ${v.name} — try reading it digit by digit.`
        : `Couldn’t find a ${v.name} in the image — try a tighter crop.`)
    }

    async function runOcr(imageDataUrl: string): Promise<void> {
      setStatus('Reading image locally…')
      cands.textContent = ''
      const res = await chrome.runtime
        .sendMessage({ kind: 'dc-ocr', imageDataUrl })
        .catch(() => null)
      if (!res?.ok) {
        setStatus(res?.error ? `OCR failed: ${res.error}` : 'OCR failed')
        return
      }
      await handleText(res.text as string, 'ocr')
    }
    activeOcr = runOcr

    const scan = h('button', { class: 'btn' }, '📷 Scan screen region')
    scan.addEventListener('click', async () => {
      host.style.visibility = 'hidden'
      try {
        const region = await selectRegion()
        if (!region) return
        await new Promise((r) => setTimeout(r, 80)) // let the overlay repaint away
        const res = await chrome.runtime.sendMessage({ kind: 'dc-capture-visible-tab' }).catch(() => null)
        if (!res?.ok) {
          setStatus('Couldn’t capture the screen on this page')
          return
        }
        const cropped = await cropToRegion(res.dataUrl as string, region)
        host.style.visibility = ''
        await runOcr(cropped)
      } finally {
        host.style.visibility = ''
      }
    })

    const paste = h('button', { class: 'btn' }, '🖼 Paste image')
    paste.addEventListener('click', () => {
      setStatus('Press ⌘V / Ctrl+V with a screenshot or photo on the clipboard')
      ;(root.querySelector('.entry') as HTMLElement | null)?.focus()
    })

    const mic = h('button', { class: 'btn' }, '🎤 Speak it')
    mic.addEventListener('click', () => {
      setStatus('Starting microphone…')
      onVoiceStatus = (state, detail) => {
        switch (state) {
          case 'listening': setStatus('Listening — read the value out loud, digit by digit'); break
          case 'downloading': setStatus(detail ?? 'Downloading the on-device speech model…'); break
          case 'unavailable':
            setStatus(detail ?? 'Voice input isn’t available on this Chrome')
            mic.setAttribute('disabled', '')
            break
          case 'error': setStatus(detail ?? 'Voice input failed'); break
        }
      }
      onVoiceResult = (alternatives) => {
        // scan both the raw transcripts and their digit-word conversions
        const text = alternatives.flatMap((a) => [a, normalizeSpoken(a)]).join('\n')
        void handleText(text, 'voice')
      }
      startVoice()
    })

    wrap.append(
      h('div', { class: 'lbl' },
        onValue ? 'Or read the value in from an image or your voice' : 'Or compare against an image or your voice'),
      h('div', { class: 'btnrow' }, scan, paste, mic),
      status, cands,
    )
    return wrap
  }

  // card-wide image-paste: works whenever the card has focus during entry
  card.addEventListener('paste', (e) => {
    if (step !== 'verify-entry' && step !== 'input-first' && step !== 'input-confirm') return
    const items = (e as ClipboardEvent).clipboardData?.items ?? []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) void fileToDataUrl(file).then((dataUrl) => activeOcr?.(dataUrl))
        return
      }
    }
  })

  // ---- attestation + logging ----
  async function confirmAndLog(r: ValidationResult): Promise<void> {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      origin: location.origin,
      fieldLabel: fieldDescription(field),
      format: formatId,
      methods: [
        'double-entry',
        ...(r.checksumPassed ? ['checksum'] : []),
        ...(usedTts ? ['read-aloud'] : []),
        ...(usedOcr ? ['ocr'] : []),
        ...(usedVoice ? ['voice'] : []),
      ],
      result: mismatchSeen ? 'mismatch-resolved' : 'match',
      attested: true,
      valueLength: r.normalized.length,
      durationMs: Date.now() - startedAt,
    }
    if (ctx.settings.hmacFingerprint) entry.fingerprint = await fingerprintValue(r.normalized)
    await appendLogEntry(entry)
    await bumpStats(mismatchSeen)
    await rememberFormat(location.origin, fieldSignature(field), formatId)
    badges.get(field)?.remove()
    markVerified(field)
    badges.set(field, attachBadge(field, () => {
      markTampered(field)
      void markLogEntryStale(entry.id)
    }))
    step = 'done'
    render()
    setTimeout(() => destroy(true), 1600)
  }

  // ---- step renderers ----
  function renderVerifyEntry(): void {
    const r = subjectResult()
    card.className = 'card'
    const input = entryInput('Re-type the value here')
    const hint = h('div', { class: 'hint' }, 'Read it from your source — not from the field. Press Enter to compare.')
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') compare(input.value)
    })
    body.textContent = ''
    const rowEl = h('div', { class: 'btnrow' })
    const compareBtn = h('button', { class: 'btn primary' }, 'Compare')
    compareBtn.addEventListener('click', () => compare(input.value))
    rowEl.append(compareBtn)
    const speak = speakButton(() => r.normalized)
    if (speak) rowEl.append(speak)
    body.append(
      chipRow(r),
      h('div', { class: 'lbl' }, 'Re-type the value from your source'),
      input, hint, rowEl,
      ocrSection(),
    )
    if (focusOnRender) input.focus()
  }

  function compare(entered: string): void {
    if (!entered.trim()) return
    lastEntered = entered
    const v = validator()
    const expected = validate(v, subjectRaw()).normalized
    const got = validate(v, entered).normalized
    lastDiagnosis = diagnose(expected, got)
    if (lastDiagnosis.kind === 'match') {
      step = 'match'
    } else {
      mismatchSeen = true
      step = 'mismatch'
    }
    render()
  }

  function renderMatch(): void {
    const r = subjectResult()
    card.className = 'card state-match'
    body.textContent = ''
    const [bigText, words] = r.formatted.includes(' — ')
      ? [r.formatted.split(' — ')[0], r.formatted.split(' — ').slice(1).join(' — ')]
      : [groupValue(r.normalized, validator().grouping), '']
    body.append(h('div', { class: 'big good' }, bigText))
    if (words) body.append(h('div', { class: 'words' }, words))
    body.append(chipRow(r))

    if (inputMode) {
      writeField(firstEntry.trim())
    }

    const checkbox = h('input', { type: 'checkbox', id: 'attest' })
    const attest = h('label', { class: 'attest', for: 'attest' },
      checkbox,
      h('span', {},
        'I have personally compared this value against the source and confirm it is correct. ' +
        'Double Check assists verification; responsibility for the value remains mine.'),
    )
    const confirmBtn = h('button', { class: 'btn primary', disabled: '' }, 'Confirm — log this check') as HTMLButtonElement
    checkbox.addEventListener('change', () => {
      if ((checkbox as HTMLInputElement).checked) confirmBtn.removeAttribute('disabled')
      else confirmBtn.setAttribute('disabled', '')
    })
    confirmBtn.addEventListener('click', () => void confirmAndLog(r))
    const rowEl = h('div', { class: 'btnrow' }, confirmBtn)
    const speak = speakButton(() => r.normalized)
    if (speak) rowEl.append(speak)
    body.append(attest, rowEl)
    if (focusOnRender) checkbox.focus()
  }

  function renderMismatch(): void {
    card.className = 'card state-mismatch'
    body.textContent = ''
    const d = lastDiagnosis!
    const panel = h('div', { class: 'panel bad' }, h('div', { class: 'why' }, `✕ ${d.message}`), diffView(d))
    const retry = h('button', { class: 'btn primary' }, inputMode ? 'Re-type again' : 'Try again')
    retry.addEventListener('click', () => {
      step = inputMode ? 'input-confirm' : 'verify-entry'
      render()
    })
    const rowEl = h('div', { class: 'btnrow' }, retry)
    if (!inputMode) {
      const enteredResult = validate(validator(), lastEntered)
      if (enteredResult.valid) {
        const useTyped = h('button', { class: 'btn' }, 'The field is wrong — use what I typed')
        useTyped.addEventListener('click', () => {
          writeField(lastEntered.trim())
          step = 'verify-entry'
          render()
        })
        rowEl.append(useTyped)
      }
    } else {
      const startOver = h('button', { class: 'btn' }, 'Start over')
      startOver.addEventListener('click', () => {
        firstEntry = ''
        step = 'input-first'
        render()
      })
      rowEl.append(startOver)
    }
    body.append(panel, h('div', { class: 'hint' }, 'One of the two entries is wrong — check your source before choosing.'), rowEl)
    if (focusOnRender) retry.focus()
  }

  function renderInputFirst(): void {
    card.className = 'card'
    body.textContent = ''
    const input = entryInput('Type the value from your source')
    if (firstEntry) input.value = firstEntry
    const liveChips = h('div', {})
    const next = h('button', { class: 'btn primary', disabled: '' }, 'Continue to step 2') as HTMLButtonElement
    const update = () => {
      const r = validate(validator(), input.value)
      liveChips.textContent = ''
      if (input.value.trim()) liveChips.appendChild(chipRow(r))
      if (r.valid) {
        // Why blue, not green: green means "verified" everywhere else in this
        // product. Step 1 only means "format looks right" — the value isn't
        // confirmed until the blind re-type matches.
        input.className = 'entry ok-shape'
        next.removeAttribute('disabled')
      } else {
        input.className = input.value.trim() ? 'entry bad' : 'entry'
        next.setAttribute('disabled', '')
      }
    }
    input.addEventListener('input', update)
    const advance = () => {
      if (!validate(validator(), input.value).valid) return
      firstEntry = input.value
      step = 'input-confirm'
      render()
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') advance()
    })
    next.addEventListener('click', advance)
    body.append(
      h('div', { class: 'lbl' }, 'Step 1 of 2 — type the value from your source'),
      input, liveChips, h('div', { class: 'btnrow' }, next),
      ocrSection((value) => {
        input.value = value
        update()
        input.focus()
      }),
    )
    update()
    if (focusOnRender) input.focus()
  }

  function renderInputConfirm(): void {
    card.className = 'card'
    body.textContent = ''
    const input = entryInput('Re-type the same value, without looking')
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') compare(input.value)
    })
    const compareBtn = h('button', { class: 'btn primary' }, 'Compare')
    compareBtn.addEventListener('click', () => compare(input.value))
    body.append(
      h('div', { class: 'lbl' }, 'Step 2 of 2 — type it again to confirm'),
      input,
      h('div', { class: 'hint' }, 'Read from your source again — your first entry stays hidden on purpose.'),
      h('div', { class: 'btnrow' }, compareBtn),
      ocrSection(),
    )
    if (focusOnRender) input.focus()
  }

  function renderDone(): void {
    card.className = 'card state-match'
    body.textContent = ''
    body.append(h('div', { class: 'done' }, '✓ Verified, attested, and logged'))
  }

  function render(): void {
    switch (step) {
      case 'verify-entry': renderVerifyEntry(); break
      case 'input-first': renderInputFirst(); break
      case 'input-confirm': renderInputConfirm(); break
      case 'match': renderMatch(); break
      case 'mismatch': renderMismatch(); break
      case 'done': renderDone(); break
    }
    position()
  }

  // ---- positioning ----
  function position(): void {
    const r = field.getBoundingClientRect()
    const ch = card.offsetHeight
    const below = r.bottom + 8 + ch <= window.innerHeight || r.top - 8 - ch < 0
    card.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - card.offsetWidth - 8)}px`
    card.style.top = below ? `${r.bottom + 8}px` : `${r.top - 8 - ch}px`
  }
  const reposition = () => requestAnimationFrame(position)
  window.addEventListener('scroll', reposition, { capture: true, passive: true })
  window.addEventListener('resize', reposition, { passive: true })

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation()
      destroy(true)
      return
    }
    // keep Tab inside the card — full keyboard flow without losing focus
    if (e.key === 'Tab') {
      const focusables = [...card.querySelectorAll<HTMLElement>('button, input, select, a')]
        .filter((el) => !el.hasAttribute('disabled'))
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = root.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }
  root.addEventListener('keydown', onKeydown as EventListener)

  function destroy(refocus = false): void {
    stopSpeaking()
    if (voiceReady) void chrome.runtime.sendMessage({ kind: 'dc-voice-stop', nonce: voiceNonce }).catch(() => {})
    chrome.runtime.onMessage.removeListener(voiceListener)
    field.removeEventListener('input', onFieldInput)
    window.removeEventListener('scroll', reposition, { capture: true })
    window.removeEventListener('resize', reposition)
    host.remove()
    if (current?.field === field) current = null
    if (refocus) field.focus()
  }

  current = { destroy, field }
  render()
}
