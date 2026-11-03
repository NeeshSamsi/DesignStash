import { singular } from '../../src/main/db/repositories/search'
import { FILLER } from './scoring'

/** Between fields, so a fragment can't match the end of one and the start of the next. */
const FIELD_BREAK = '\n|\n'

/** Each `absent` fragment from gold.json as a case-insensitive regex. Throws on one that doesn't compile. */
export function compileAbsent(fragments: string[]): RegExp[] {
  return fragments.map((fragment) => {
    try {
      return new RegExp(fragment, 'giu')
    } catch (err) {
      throw new Error(
        `absent fragment ${JSON.stringify(fragment)} is not a regex: ${(err as Error).message}`,
        { cause: err }
      )
    }
  })
}

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch)

/**
 * The words in `text` that any pattern matches: each match widened to the whole words around it
 * ("flexib" gives "flexible"), lower case, each word once. Patterns come from `compileAbsent`.
 */
export function absentWords(text: string, patterns: RegExp[]): string[] {
  const found = new Set<string>()
  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      if (m[0].length === 0) continue
      let start = m.index
      let end = m.index + m[0].length
      while (isWordChar(text[start - 1])) start--
      while (isWordChar(text[end])) end++
      found.add(text.slice(start, end).toLowerCase().replace(/\s+/g, ' ').trim())
    }
  }
  return [...found]
}

const norm = (word: string) => singular(word.toLowerCase())

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter(Boolean)
}

/** Every word in a gold entry, singular and lower case. A hyphenated word adds its parts and the parts joined. */
export function supportWords(gold: Pick<GoldEntry, 'title' | 'description' | 'tags'>): Set<string> {
  const words = new Set<string>()
  const text = [gold.title, gold.description, ...gold.tags.map((t) => t.label)].join(' ')
  for (const token of tokens(text)) {
    words.add(norm(token.replace(/-/g, '')))
    for (const part of token.split('-')) if (part) words.add(norm(part))
  }
  return words
}

/**
 * Whether every word of a saved tag label is in the gold text (case, hyphens and plurals ignored;
 * filler skipped). Null when the label has no words to check.
 */
export function labelSupported(label: string, words: Set<string>): boolean | null {
  const parts = tokens(label).filter((t) => !FILLER.has(t))
  if (parts.length === 0) return null
  return parts.every(
    (t) =>
      words.has(norm(t.replace(/-/g, ''))) ||
      t
        .split('-')
        .filter(Boolean)
        .every((p) => words.has(norm(p)))
  )
}

export interface GoldEntry {
  title: string
  description: string
  tags: { category: string; label: string }[]
  /** Case-insensitive regex fragments that must not appear in this cover's answer. */
  absent?: string[]
}

export interface AnswerCheck {
  id: string
  repeat: number
  /** Gold has an `absent` list for this item. */
  absentChecked: boolean
  absentWords: string[]
  /** Saved tag labels with words to check. */
  labels: number
  /** Of those, the ones whose words are all in the gold title, description or tags. */
  supported: number
  unsupported: string[]
}

/**
 * One answer against its gold entry. The absent fragments are matched against everything the app
 * would make searchable or show: title, description, saved tag labels and keywords, field by field.
 */
export function checkAnswer(
  answer: { id: string; repeat: number; title: string; description: string; keywords?: string[] },
  savedLabels: string[],
  gold: GoldEntry
): AnswerCheck {
  const text = [answer.title, answer.description, ...savedLabels, ...(answer.keywords ?? [])].join(
    FIELD_BREAK
  )
  const words = supportWords(gold)
  const unsupported: string[] = []
  let labels = 0
  for (const label of savedLabels) {
    const ok = labelSupported(label, words)
    if (ok === null) continue
    labels++
    if (!ok) unsupported.push(label)
  }
  return {
    id: answer.id,
    repeat: answer.repeat,
    absentChecked: gold.absent !== undefined,
    absentWords: gold.absent ? absentWords(text, compileAbsent(gold.absent)) : [],
    labels,
    supported: labels - unsupported.length,
    unsupported
  }
}

export interface HallucinationSummary {
  /** Answers whose gold entry has an `absent` list. */
  answers: number
  /** Share of those with any absent word. */
  hallucinated: number
  /** Mean absent words per answer, over the same answers. */
  absentPerAnswer: number
  /** Saved tag labels checked, over every answer with a gold entry. */
  labels: number
  /** Share of those labels the gold text supports. */
  tagSupport: number
}

export function summarise(checks: AnswerCheck[]): HallucinationSummary {
  const checked = checks.filter((c) => c.absentChecked)
  const labels = checks.reduce((t, c) => t + c.labels, 0)
  const supported = checks.reduce((t, c) => t + c.supported, 0)
  return {
    answers: checked.length,
    hallucinated:
      checked.length === 0
        ? 0
        : checked.filter((c) => c.absentWords.length > 0).length / checked.length,
    absentPerAnswer:
      checked.length === 0
        ? 0
        : checked.reduce((t, c) => t + c.absentWords.length, 0) / checked.length,
    labels,
    tagSupport: labels === 0 ? 0 : supported / labels
  }
}
