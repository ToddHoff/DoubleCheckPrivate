export type DiffType = 'same' | 'sub' | 'del' | 'add'

/** one aligned step between expected and entered (del = expected char missing, add = extra char entered) */
export interface DiffOp {
  type: DiffType
  expected?: string
  entered?: string
}

export type MismatchKind = 'match' | 'transposition' | 'substitution' | 'deletion' | 'insertion' | 'multiple'

export interface Diagnosis {
  kind: MismatchKind
  /** human explanation, 1-based positions */
  message: string
  diff: DiffOp[]
}

function alignDiff(a: string, b: string): DiffOp[] {
  // O(n·m) edit-distance backtrace — values are short
  const n = a.length, m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 0; i <= n; i++) dp[i][0] = i
  for (let j = 0; j <= m; j++) dp[0][j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  const ops: DiffOp[] = []
  let i = n, j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      ops.push({ type: 'same', expected: a[i - 1], entered: b[j - 1] }); i--; j--
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.push({ type: 'sub', expected: a[i - 1], entered: b[j - 1] }); i--; j--
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: 'del', expected: a[i - 1] }); i--
    } else {
      ops.push({ type: 'add', entered: b[j - 1] }); j--
    }
  }
  return ops.reverse()
}

/**
 * Classify how `entered` differs from `expected` (both already normalized).
 * Transposed adjacent digits get called out by name — it's the classic
 * transcription error and naming it is half the product.
 */
export function diagnose(expected: string, entered: string): Diagnosis {
  if (expected === entered) {
    return { kind: 'match', message: 'Values match exactly', diff: alignDiff(expected, entered) }
  }

  if (expected.length === entered.length) {
    const diffPos: number[] = []
    for (let i = 0; i < expected.length; i++) if (expected[i] !== entered[i]) diffPos.push(i)
    if (diffPos.length === 2 && diffPos[1] === diffPos[0] + 1 &&
        expected[diffPos[0]] === entered[diffPos[1]] && expected[diffPos[1]] === entered[diffPos[0]]) {
      const [p] = diffPos
      return {
        kind: 'transposition',
        message: `Characters ${p + 1} and ${p + 2} appear swapped — “${expected[p]}${expected[p + 1]}” vs “${entered[p]}${entered[p + 1]}”`,
        diff: alignDiff(expected, entered),
      }
    }
    if (diffPos.length === 1) {
      const p = diffPos[0]
      return {
        kind: 'substitution',
        message: `One character differs at position ${p + 1} — “${expected[p]}” vs “${entered[p]}”`,
        diff: alignDiff(expected, entered),
      }
    }
  }

  if (expected.length - entered.length === 1) {
    const d = alignDiff(expected, entered)
    if (d.filter((o) => o.type !== 'same').length === 1) {
      const pos = d.findIndex((o) => o.type === 'del')
      return {
        kind: 'deletion',
        message: `The re-entered value is missing “${expected[pos]}” at position ${pos + 1}`,
        diff: d,
      }
    }
  }
  if (entered.length - expected.length === 1) {
    const d = alignDiff(expected, entered)
    if (d.filter((o) => o.type !== 'same').length === 1) {
      const pos = d.findIndex((o) => o.type === 'add')
      return {
        kind: 'insertion',
        message: `The re-entered value has an extra “${d[pos].entered}” at position ${pos + 1}`,
        diff: d,
      }
    }
  }

  const d = alignDiff(expected, entered)
  const count = d.filter((o) => o.type !== 'same').length
  return {
    kind: 'multiple',
    message: `Values differ in ${count} places`,
    diff: d,
  }
}
