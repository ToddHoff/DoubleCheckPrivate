import { BUILTIN_VALIDATORS, fromUserSpec, validate } from '../../engine'
import type { NormalizeOp, ValidatorSpec } from '../../engine'
import { downloadText, h } from '../../shared/dom'
import { getUserValidatorSpecs, saveUserValidatorSpecs } from '../../shared/storage'

const NORMALIZE_OPS: Array<[NormalizeOp, string]> = [
  ['trim', 'Trim whitespace'],
  ['strip-spaces', 'Remove spaces'],
  ['strip-dashes', 'Remove dashes'],
  ['strip-dots', 'Remove dots'],
  ['strip-parens', 'Remove parentheses'],
  ['uppercase', 'Uppercase'],
  ['lowercase', 'Lowercase'],
]

const CHECKSUM_OPTIONS: Array<[string, string]> = [
  ['', 'None — shape rules only'],
  ['luhn', 'Luhn (cards, many IDs)'],
  ['aba', 'ABA routing (3-7-1 mod 10)'],
  ['mod97-iban', 'IBAN mod-97'],
  ['damm', 'Damm'],
  ['verhoeff', 'Verhoeff'],
  ['clabe', 'CLABE'],
  ['cusip', 'CUSIP'],
  ['isin', 'ISIN'],
  ['vin', 'VIN'],
  ['weighted-mod', 'Weighted modulus (custom)'],
]

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'custom'
}

export async function renderFormatsTab(rootEl: HTMLElement): Promise<void> {
  let specs = await getUserValidatorSpecs()

  const rerender = () => {
    rootEl.textContent = ''
    void renderFormatsTab(rootEl)
  }

  // ---- editor ----
  function openEditor(initial: Partial<ValidatorSpec>, isNew: boolean): HTMLElement {
    const wrap = h('section', { class: 'panel' }, h('h2', {}, isNew ? 'New format' : `Edit: ${initial.name}`))

    const name = h('input', { type: 'text', value: initial.name ?? '' }) as HTMLInputElement
    const notes = h('input', { type: 'text', value: initial.notes ?? '' }) as HTMLInputElement
    const pattern = h('input', { type: 'text', class: 'mono', value: initial.pattern ?? '', placeholder: '\\d{9}  (anchored automatically)' }) as HTMLInputElement
    const lenMin = h('input', { type: 'number', value: initial.length ? String(initial.length.min) : '', placeholder: 'min' }) as HTMLInputElement
    const lenMax = h('input', { type: 'number', value: initial.length ? String(initial.length.max) : '', placeholder: 'max' }) as HTMLInputElement
    const grouping = h('input', { type: 'text', class: 'mono', value: (initial.grouping ?? []).join(','), placeholder: 'e.g. 3,3,3' }) as HTMLInputElement

    const normBoxes = NORMALIZE_OPS.map(([op, label]) => {
      const box = h('input', { type: 'checkbox', value: op }) as HTMLInputElement
      box.checked = (initial.normalize ?? ['trim']).includes(op)
      return { box, el: h('label', { style: 'margin-right:14px;font-weight:400' }, box, ` ${label}`) }
    })

    const checksum = h('select', {}) as HTMLSelectElement
    for (const [v, label] of CHECKSUM_OPTIONS) {
      const opt = h('option', { value: v }, label)
      if ((initial.checksum?.algo ?? '') === v) opt.setAttribute('selected', '')
      checksum.appendChild(opt)
    }
    const weights = h('input', { type: 'text', class: 'mono', placeholder: 'weights e.g. 3,7,1' }) as HTMLInputElement
    const modulus = h('input', { type: 'number', placeholder: 'modulus', value: '10' }) as HTMLInputElement
    const wmMode = h('select', {},
      h('option', { value: 'check-digit' }, 'last digit is check digit'),
      h('option', { value: 'sum-zero' }, 'whole value sums to 0'),
    ) as HTMLSelectElement
    const wmTerm = h('select', {},
      h('option', { value: 'none' }, 'term = digit × weight'),
      h('option', { value: 'mod10' }, 'term = (digit × weight) mod 10'),
      h('option', { value: 'digit-sum' }, 'term = digit sum of product'),
    ) as HTMLSelectElement
    if (initial.checksum?.algo === 'weighted-mod') {
      weights.value = initial.checksum.weights.join(',')
      modulus.value = String(initial.checksum.modulus)
      wmMode.value = initial.checksum.mode ?? 'check-digit'
      wmTerm.value = initial.checksum.termTransform ?? 'none'
    }
    const wmRow = h('div', { class: 'wide', style: 'display:none;gap:8px' }, weights, modulus, wmTerm, wmMode)
    const syncWm = () => { wmRow.style.display = checksum.value === 'weighted-mod' ? 'flex' : 'none' }
    checksum.addEventListener('change', syncWm)
    syncWm()

    // live test box
    const testInput = h('input', { type: 'text', class: 'mono wide', placeholder: 'Type a sample value to test…' }) as HTMLInputElement
    const testOut = h('div', { class: 'chips wide' })

    function currentSpec(): ValidatorSpec | null {
      const spec: ValidatorSpec = {
        id: (initial.id as string) || slugify(name.value),
        name: name.value.trim(),
        notes: notes.value.trim() || undefined,
        normalize: normBoxes.filter(({ box }) => box.checked).map(({ box }) => box.value as NormalizeOp),
        pattern: pattern.value.trim() || undefined,
        length: lenMin.value && lenMax.value ? { min: Number(lenMin.value), max: Number(lenMax.value) } : undefined,
        checksum: null,
        grouping: grouping.value.trim()
          ? grouping.value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0)
          : undefined,
        speech: 'char-by-char',
      }
      if (checksum.value === 'weighted-mod') {
        spec.checksum = {
          algo: 'weighted-mod',
          weights: weights.value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0),
          modulus: Number(modulus.value),
          mode: wmMode.value as 'check-digit' | 'sum-zero',
          termTransform: wmTerm.value as 'none' | 'mod10' | 'digit-sum',
        }
      } else if (checksum.value) {
        spec.checksum = { algo: checksum.value as Exclude<NonNullable<ValidatorSpec['checksum']>, { algo: 'weighted-mod' }>['algo'] }
      }
      return fromUserSpec(spec) ? spec : null
    }

    const runTest = () => {
      testOut.textContent = ''
      const spec = currentSpec()
      if (!spec) {
        testOut.appendChild(h('span', { class: 'chip err' }, '✕ Spec is incomplete or invalid (name, pattern, and checksum fields must parse)'))
        return
      }
      if (!testInput.value.trim()) return
      const r = validate(fromUserSpec(spec)!, testInput.value)
      if (r.valid && r.checksumPassed) testOut.appendChild(h('span', { class: 'chip ok' }, '✓ Checksum valid'))
      else if (r.valid) testOut.appendChild(h('span', { class: 'chip ok' }, '✓ Valid'))
      for (const e of r.errors) testOut.appendChild(h('span', { class: 'chip err' }, `✕ ${e}`))
      for (const w of r.warnings) testOut.appendChild(h('span', { class: 'chip warn' }, `⚠ ${w}`))
      if (r.valid) testOut.appendChild(h('span', { class: 'chip warn' }, `display: ${r.formatted}`))
    }
    testInput.addEventListener('input', runTest)
    for (const el of [name, pattern, lenMin, lenMax, grouping, weights, modulus]) el.addEventListener('input', runTest)
    checksum.addEventListener('change', runTest)

    const saveBtn = h('button', { class: 'btn primary' }, isNew ? 'Add format' : 'Save changes')
    saveBtn.addEventListener('click', async () => {
      const spec = currentSpec()
      if (!spec) {
        runTest()
        return
      }
      if (isNew && (specs.some((s) => s.id === spec.id) || BUILTIN_VALIDATORS.some((b) => b.id === spec.id))) {
        spec.id = `${spec.id}-${Date.now() % 10000}`
      }
      specs = isNew ? [...specs, spec] : specs.map((s) => (s.id === spec.id ? spec : s))
      await saveUserValidatorSpecs(specs)
      rerender()
    })
    const cancelBtn = h('button', { class: 'btn' }, 'Cancel')
    cancelBtn.addEventListener('click', rerender)

    wrap.append(
      h('div', { class: 'editor' },
        h('label', {}, 'Name'), name,
        h('label', {}, 'Notes'), notes,
        h('label', {}, 'Clean-up'), h('div', {}, ...normBoxes.map(({ el }) => el)),
        h('label', {}, 'Pattern (regex)'), pattern,
        h('label', {}, 'Length'), h('div', { style: 'display:flex;gap:8px' }, lenMin, lenMax),
        h('label', {}, 'Checksum'), checksum,
        wmRow,
        h('label', {}, 'Digit grouping'), grouping,
        h('label', {}, 'Test it'), testInput,
        testOut,
      ),
      h('div', { class: 'btnrow' }, saveBtn, cancelBtn),
    )
    return wrap
  }

  // ---- list view ----
  const newBtn = h('button', { class: 'btn primary' }, '+ New format')
  newBtn.addEventListener('click', () => {
    rootEl.textContent = ''
    rootEl.append(openEditor({ normalize: ['trim', 'strip-spaces', 'strip-dashes'] }, true))
  })

  const exportBtn = h('button', { class: 'btn' }, 'Export custom formats')
  exportBtn.addEventListener('click', () =>
    downloadText('double-check-formats.json', 'application/json', JSON.stringify(specs, null, 2)))

  const importInput = h('input', { type: 'file', accept: '.json', style: 'display:none' }) as HTMLInputElement
  const importBtn = h('button', { class: 'btn' }, 'Import formats')
  importBtn.addEventListener('click', () => importInput.click())
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      const incoming = (Array.isArray(parsed) ? parsed : [parsed]).filter((s) => fromUserSpec(s) !== null) as ValidatorSpec[]
      const byId = new Map(specs.map((s) => [s.id, s]))
      for (const s of incoming) byId.set(s.id, s)
      specs = [...byId.values()]
      await saveUserValidatorSpecs(specs)
      rerender()
    } catch {
      alert('That file isn’t a valid Double Check format export.')
    }
  })

  const userList = h('div', { class: 'vlist' })
  for (const spec of specs) {
    const edit = h('button', { class: 'btn' }, 'Edit')
    edit.addEventListener('click', () => {
      rootEl.textContent = ''
      rootEl.append(openEditor(spec, false))
    })
    const del = h('button', { class: 'btn danger' }, 'Delete')
    del.addEventListener('click', async () => {
      if (!confirm(`Delete “${spec.name}”?`)) return
      specs = specs.filter((s) => s.id !== spec.id)
      await saveUserValidatorSpecs(specs)
      rerender()
    })
    userList.appendChild(h('div', { class: 'vitem' },
      h('span', { class: 'name' }, spec.name),
      h('span', { class: 'meta' }, [spec.pattern && 'pattern', spec.length && 'length', spec.checksum && `checksum: ${spec.checksum.algo}`].filter(Boolean).join(' · ') || 'no rules'),
      edit, del,
    ))
  }

  const builtinList = h('div', { class: 'vlist' })
  for (const b of BUILTIN_VALIDATORS) {
    const clone = h('button', { class: 'btn' }, 'Clone')
    clone.addEventListener('click', () => {
      rootEl.textContent = ''
      rootEl.append(openEditor({
        name: `${b.name} (copy)`,
        normalize: b.normalize,
        pattern: b.pattern,
        length: b.length,
        checksum: b.checksum && b.checksum.algo !== 'weighted-mod' ? { algo: b.checksum.algo } : b.checksum,
        grouping: b.grouping,
        notes: b.notes,
      }, true))
    })
    builtinList.appendChild(h('div', { class: 'vitem' },
      h('span', { class: 'name' }, b.name),
      h('span', { class: 'meta' }, b.checksum || b.mathCheck ? 'mathematical check ✓' : 'shape rules'),
      clone,
    ))
  }

  rootEl.append(
    h('section', { class: 'panel' },
      h('h2', {}, 'Custom formats'),
      h('p', { class: 'muted' },
        'Formats are declarative rules — clean-up steps, a pattern, lengths, and a checksum from the menu. ' +
        'They are data, never code, so a shared format file can’t do anything but validate. Share them with your team via export/import.'),
      h('div', { class: 'btnrow' }, newBtn, importBtn, exportBtn),
      specs.length ? userList : h('p', { class: 'muted' }, 'None yet.'),
    ),
    h('section', { class: 'panel' },
      h('h2', {}, 'Built-in formats'),
      builtinList,
    ),
  )
  rootEl.append(importInput)
}
