/** Scoring round 4's variation words (`variation.ts`) against `round4/variations.json`. */

export interface GoldVariation {
  /** What I'd say. */
  say: string
  /** Regex fragments, case-insensitive; any one makes an answer right. */
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
  if (gold.accept.some((a) => new RegExp(a, 'i').test(said))) return 'right'
  return 'other'
}

/**
 * The fallback when the model can't tell, for each file in a pile: the short part of its name the
 * others don't share ("A" in tote-a, "2" in mug-2). When the names give none, or two would get the
 * same one, every mockup gets its number in the pile.
 */
export function fileMarkers(fileNames: string[]): string[] {
  const words = fileNames.map((n) => n.replace(/\.[^.]+$/, '').split(/[-_\s.]+/).filter(Boolean))
  const markers = words.map((mine, i) => {
    const others = words.filter((_, j) => j !== i)
    const own = mine.filter((w, k) => others.every((o) => o[k] !== w) && /^(?:[a-z]|\d{1,2})$/i.test(w))
    return own.length === 1 ? own[0]!.toUpperCase() : null
  })
  const unique = markers.every((m) => m !== null) && new Set(markers).size === markers.length
  return unique ? (markers as string[]) : fileNames.map((_, i) => String(i + 1))
}
