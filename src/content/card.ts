import type { Diagnosis, ValidationResult, Validator } from '../engine'
import { diagnose, extractCandidates, groupValue, validate } from '../engine'
import { cropToRegion, fileToDataUrl, selectRegion } from './capture'
import type { LicenseStatus, LogEntry, Settings } from '../shared/types'
import { appendLogEntry, bumpStats, fingerprintValue, markLogEntryStale, rememberFormat } from '../shared/storage'
import { CARD_CSS } from './styles'
import { canSpeakLocally, speakValue, stopSpeaking } from './speech'
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
  const inputMode = step === 'input-first'
  let formatId = ctx.remembered ?? ctx.suggestions[0] ??
    (/^[\d\s().+-]*$/.test(field.value) ? 'generic-number' : 'generic-text')
  let firstEntry = '' // input mode: the value typed from the source
  let lastDiagnosis: Diagnosis | null = null
  let lastEntered = ''
  let mismatchSeen = false
  let usedTts = false
  let usedOcr = false

  const validator = () =>
    ctx.validators.find((v) => v.id === formatId) ?? ctx.validators.find((v) => v.id === 'generic-text')!

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
          void chrome.runtime.sendMessage({ kind: 'dc-payment-action', action: 'pay-yearly' }))
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

  const speakButton = (text: () => string): HTMLElement | null => {
    if (!ctx.settings.ttsEnabled || !canSpeakLocally()) return null
    const btn = h('button', { class: 'btn speak', title: 'Read aloud (local voice)' }, '🔊')
    btn.addEventListener('click', () => {
      usedTts = true
      speakValue(text(), validator())
    })
    return btn
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

  function ocrSection(): HTMLElement {
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

    async function handleText(text: string): Promise<void> {
      const v = validator()
      const { matches, nears } = extractCandidates(text, v)
      const expected = validate(v, subjectRaw()).normalized
      cands.textContent = ''
      const useCandidate = (c: string) => {
        usedOcr = true
        compare(c)
      }
      if (matches.includes(expected)) {
        useCandidate(expected)
        return
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
        setStatus(`Nothing in the image passes ${v.name} validation. Close-but-failing reads:`)
        for (const n of nears) {
          const chip = h('button', { class: 'chip err cand' }, n)
          chip.addEventListener('click', () => useCandidate(n))
          cands.appendChild(chip)
        }
        return
      }
      setStatus(`Couldn’t find a ${v.name} in the image — try a tighter crop.`)
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
      await handleText(res.text as string)
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

    wrap.append(
      h('div', { class: 'lbl' }, 'Or compare against an image of the source'),
      h('div', { class: 'btnrow' }, scan, paste),
      status, cands,
    )
    return wrap
  }

  // card-wide image-paste: works whenever the card has focus during entry
  card.addEventListener('paste', (e) => {
    if (step !== 'verify-entry' && step !== 'input-confirm') return
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
    input.focus()
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
      writeFieldValue(field, firstEntry.trim())
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
    checkbox.focus()
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
          writeFieldValue(field, lastEntered.trim())
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
    retry.focus()
  }

  function renderInputFirst(): void {
    card.className = 'card'
    body.textContent = ''
    const input = entryInput('Type the value from your source')
    if (firstEntry) input.value = firstEntry
    const liveChips = h('div', {})
    const next = h('button', { class: 'btn primary', disabled: '' }, 'Continue → re-type to confirm') as HTMLButtonElement
    const update = () => {
      const r = validate(validator(), input.value)
      liveChips.textContent = ''
      if (input.value.trim()) liveChips.appendChild(chipRow(r))
      if (r.valid) {
        input.className = 'entry good'
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
      h('div', { class: 'lbl' }, 'This field is empty — enter the value, then confirm it blind'),
      input, liveChips, h('div', { class: 'btnrow' }, next),
    )
    update()
    input.focus()
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
      h('div', { class: 'lbl' }, 'Re-type it from the source to confirm'),
      input,
      h('div', { class: 'hint' }, 'Read from your source again — the first entry stays hidden on purpose.'),
      h('div', { class: 'btnrow' }, compareBtn),
      ocrSection(),
    )
    input.focus()
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
    window.removeEventListener('scroll', reposition, { capture: true })
    window.removeEventListener('resize', reposition)
    host.remove()
    if (current?.field === field) current = null
    if (refocus) field.focus()
  }

  current = { destroy, field }
  render()
}
