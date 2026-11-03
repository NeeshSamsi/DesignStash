import { SEARCH_THESAURUS } from './search-thesaurus'

/** Lowercase words separated by single spaces: punctuation and hyphens count as spaces. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const ENTRIES = Object.entries(SEARCH_THESAURUS).map(
  ([phrase, words]) => [normalise(phrase), words] as const
)

/**
 * The hidden search words for a mockup: for every thesaurus phrase found as a whole word or phrase
 * (case-insensitive, with an optional plural "s" or "es") in the title, description or tag labels,
 * the other names listed for it. Words are only added, in thesaurus order, without repeats.
 * `nameWords` (from the file and folder names) come first and are expanded like the rest.
 */
export function searchKeywords(
  title: string,
  description: string,
  tagLabels: readonly string[],
  nameWords: readonly string[] = []
): string[] {
  const text = ` ${normalise([title, description, ...tagLabels, ...nameWords].join(' '))} `
  const found = new Set<string>(nameWords)
  for (const [phrase, words] of ENTRIES) {
    if (!phrase) continue
    const at = (suffix: string) => text.includes(` ${phrase}${suffix} `)
    if (at('') || at('s') || at('es')) for (const w of words) found.add(w)
  }
  return [...found]
}
