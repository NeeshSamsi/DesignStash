import { createHash } from 'node:crypto'

/**
 * Meaning search, as evaluated in the AI bake-off (Roadmap, "Meaning search measured"): nomic-embed
 * v1.5 vectors, keyword hits first, then the closest meaning hit if it reaches the floor. The
 * eval harness (`scripts/ai-eval/meaning.ts`) imports this file, so it measures what ships.
 */

/** The catalogue id of the embedding model, and the id stored beside each vector. */
export const MEANING_MODEL_ID = 'nomic-embed-v1.5'
/** The least cosine a meaning hit needs. */
export const MEANING_FLOOR = 0.55
/** How many meaning hits a search adds, at most. */
export const MEANING_TOP = 1
/** A search shorter than this is keyword-only. */
export const MEANING_MIN_QUERY_CHARS = 3
/** Nomic wants these in front of what it embeds. */
export const DOCUMENT_PREFIX = 'search_document: '
export const QUERY_PREFIX = 'search_query: '
/** Characters of a document that are embedded; far under the server's context. */
export const MAX_DOCUMENT_CHARS = 1500

/** What is embedded for a mockup: title, description and each tag label, in that order. */
export function meaningDocument(
  title: string,
  description: string | null | undefined,
  tagLabels: readonly string[]
): string {
  return [title, description ?? '', ...tagLabels]
    .filter((part) => part.trim() !== '')
    .join('. ')
    .slice(0, MAX_DOCUMENT_CHARS)
}

/** A short hash of the embedded text, to tell when a vector is out of date. */
export function documentHash(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}

export function normalise(v: readonly number[]): number[] {
  const n = Math.sqrt(v.reduce((t, x) => t + x * x, 0)) || 1
  return v.map((x) => x / n)
}

/** Cosine of two unit vectors. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!
  return sum
}

/** The closest `top` items at or above the floor, closest first. */
export function meaningHits<K>(
  similarities: ReadonlyMap<K, number>,
  { floor, top }: { floor: number; top: number }
): K[] {
  return [...similarities]
    .filter(([, s]) => s >= floor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([id]) => id)
}

/** Every keyword hit first, in order, then the meaning hits keyword search did not find. */
export function appendMeaningHits<K>(keywordIds: readonly K[], hits: readonly K[]): K[] {
  const seen = new Set(keywordIds)
  return [...keywordIds, ...hits.filter((id) => !seen.has(id))]
}
