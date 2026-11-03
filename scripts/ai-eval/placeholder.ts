import { absentWords, compileAbsent } from './hallucination'

/**
 * Placeholder mentions: words about a mockup's replaceable content (its design slot), which is where
 * the designer's own work goes and should never be described. `placeholders.json` says, per item,
 * what the slot shows in the cover (read from the PSD's smart objects by `ai-eval:slots`) and the
 * regex fragments that describe it; `generic` fragments (grid, checker, "screen showing") apply to
 * every item that has a slot.
 */
export interface PlaceholderEntry {
  /** What the slot shows in the cover, in a few words. */
  shows: string
  /** Regex fragments for this item's sample art, matched case-insensitively. */
  patterns: string[]
}

export interface PlaceholderData {
  generic: string[]
  items: Record<string, PlaceholderEntry>
}

export interface PlaceholderCheck {
  id: string
  repeat: number
  words: string[]
}

/** Between fields, so a fragment can't match across two. */
const FIELD_BREAK = '\n|\n'

/** The placeholder words in one answer: title, description, saved tag labels and keywords. */
export function placeholderWords(
  answer: { title: string; description: string; keywords?: string[] },
  savedLabels: string[],
  entry: PlaceholderEntry,
  generic: string[]
): string[] {
  const text = [answer.title, answer.description, ...savedLabels, ...(answer.keywords ?? [])].join(FIELD_BREAK)
  return absentWords(text, compileAbsent([...generic, ...entry.patterns]))
}

export interface PlaceholderSummary {
  /** Answers about an item with a slot. */
  answers: number
  /** Share of those that mention the placeholder. */
  mentioned: number
  /** Placeholder words per answer. */
  wordsPerAnswer: number
}

export function summarisePlaceholders(checks: PlaceholderCheck[]): PlaceholderSummary {
  const n = checks.length
  return {
    answers: n,
    mentioned: n === 0 ? 0 : checks.filter((c) => c.words.length > 0).length / n,
    wordsPerAnswer: n === 0 ? 0 : checks.reduce((t, c) => t + c.words.length, 0) / n
  }
}

/**
 * Broad or wrong "also called" names: a word that names no kind of object a designer would search
 * for ("a laptop, also called a computer", "a MacBook, also called a website"). Measured on the
 * round 2 answers (design/research/ai-round3.md).
 */
const BAD_ALTERNATE =
  /\balso (?:called|known as) (?:an? |the )?(?:(?:printed|packaging|screen|touchscreen|digital|small) )?(?:design|product|prop|mock-?up|thing|item|object|container|computer|website|document|devices?|template|piece|accessory|surface)s?\b/i

/** The bad "also called" phrase in a description, or null. */
export function badAlternate(description: string): string | null {
  return BAD_ALTERNATE.exec(description)?.[0] ?? null
}
