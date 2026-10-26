/** Scoring round 4's variation words (`variation.ts`) against `round4/variations.json`. */

export interface GoldVariation {
  /** What I'd say. */
  say: string
  /** Regex fragments, case-insensitive, matched from the start of a word; any one makes an answer right. */
  accept: string[]
  /** Only a slight turn or crop sets it apart, so "same" isn't wrong. */
  subtle?: boolean
  /** It looks the same as the rest, so "same" is right. */
  same?: boolean
}

export type Verdict = 'right' | 'same' | 'other'

const SAME = /^\s*(?:same|the same|none|no difference|identical|n\/a|nothing)\b/i

/** Right (an accepted word, or "same" where they look the same), a "same" call, or something else. */
export function judge(said: string, gold: GoldVariation): Verdict {
  if (SAME.test(said)) return gold.same ? 'right' : 'same'
  if (gold.accept.some((a) => new RegExp(`\\b(?:${a})`, 'i').test(said))) return 'right'
  return 'other'
}

// The fallback lives in the app now (src/shared/pile-variation.ts), which this eval proved.
export { fileMarkers } from '../../src/shared/pile-variation'
