import { createHash } from 'node:crypto'
import { MEANING_MODEL_ID } from '../../shared/meaning'

export { MEANING_MODEL_ID }

/**
 * Meaning search, as evaluated in the AI bake-off (Roadmap, "Meaning search measured"): nomic-embed
 * v1.5 vectors, keyword hits first, then the closest meaning hit if it reaches the floor. The
 * eval harness (`scripts/ai-eval/meaning.ts`) imports this file, so it measures what ships.
 */

/** The least cosine a meaning hit needs. */
export const MEANING_FLOOR = 0.55
/** How many meaning hits a search adds, at most. */
export const MEANING_TOP = 1
/** A search shorter than this is keyword-only. */
export const MEANING_MIN_QUERY_CHARS = 3
/**
 * How long a search waits for meaning search before showing keyword results without it (F-017).
 * A warm model answers in tens of milliseconds; a cold start takes 0.3 s or more (R-004).
 */
export const MEANING_WAIT_MS = 300
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

/**
 * How many of nomic v1.5's 768 numbers a meaning vector keeps. It is trained (Matryoshka) to hold
 * its meaning in the first ones, so the first 256 search almost as well at a third of the size and
 * scoring time (F-070).
 */
export const MEANING_DIMENSIONS = 256

/**
 * A vector cut to `MEANING_DIMENSIONS`, by nomic v1.5's recipe: layer norm over the whole vector,
 * then the first numbers, at unit length. A vector of any scale gives the same one.
 */
export function shortVector(v: ArrayLike<number>): Float32Array {
  const n = v.length
  let mean = 0
  for (let i = 0; i < n; i++) mean += v[i]!
  mean /= n
  let variance = 0
  for (let i = 0; i < n; i++) variance += (v[i]! - mean) ** 2
  const sd = Math.sqrt(variance / n + 1e-5)
  const out = new Float32Array(Math.min(MEANING_DIMENSIONS, n))
  for (let i = 0; i < out.length; i++) out[i] = (v[i]! - mean) / sd
  return Float32Array.from(normalise(Array.from(out)))
}

/** A document's vector as it is kept: short, each number a signed byte (-127 to 127). */
export function compactVector(v: ArrayLike<number>): Int8Array {
  return Int8Array.from(shortVector(v), (x) => Math.max(-127, Math.min(127, Math.round(x * 127))))
}

/** Cosine of a short unit query (`shortVector`) and a compact document vector. */
export function compactCosine(query: ArrayLike<number>, doc: Int8Array): number {
  let dot = 0
  let norm = 0
  for (let i = 0; i < doc.length; i++) {
    dot += query[i]! * doc[i]!
    norm += doc[i]! * doc[i]!
  }
  return norm === 0 ? 0 : dot / Math.sqrt(norm)
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
