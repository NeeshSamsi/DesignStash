/**
 * The edit preview's description diff (design/specs/look-over.md, L7): the variant's sentence with
 * only the changed words marked, removed then added, or the before and after on two rows when most
 * of the sentence changes. Words keep their punctuation, so the diff reads in whole words.
 */

export interface DiffPart {
  kind: 'same' | 'removed' | 'added'
  text: string
}

export type WordDiff =
  | { mode: 'inline'; parts: DiffPart[] }
  | { mode: 'rows'; before: string; after: string }

const words = (text: string) => text.split(/\s+/).filter(Boolean)

/** Below this share of unchanged words, the sentence reads better as before and after. */
const INLINE_AT_LEAST = 0.5

export function wordDiff(before: string, after: string): WordDiff {
  const a = words(before)
  const b = words(after)
  // Longest common subsequence of words, table from the end.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const same = lcs[0]![0]!
  if (same < INLINE_AT_LEAST * Math.max(a.length, b.length, 1))
    return { mode: 'rows', before, after }

  const parts: DiffPart[] = []
  const add = (kind: DiffPart['kind'], word: string) => {
    const last = parts[parts.length - 1]
    if (last?.kind === kind) last.text += ` ${word}`
    else parts.push({ kind, text: word })
  }
  // Within a change, every removed word comes before the added ones.
  let removed: string[] = []
  let added: string[] = []
  const flush = () => {
    for (const w of removed) add('removed', w)
    for (const w of added) add('added', w)
    removed = []
    added = []
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush()
      add('same', a[i]!)
      i++
      j++
    } else if (j >= b.length || (i < a.length && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      removed.push(a[i++]!)
    } else {
      added.push(b[j++]!)
    }
  }
  flush()
  return { mode: 'inline', parts }
}
