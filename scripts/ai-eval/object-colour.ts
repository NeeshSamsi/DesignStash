/**
 * Object-colour mentions (round 4), counted with the app's own matching (`src/main/ai/object-colour.ts`),
 * so the count and the strip that ships agree.
 */
export { COLOUR_WORDS, objectColourWords, withoutObjectColours } from '../../src/main/ai/object-colour'

export interface ObjectColourCheck {
  id: string
  repeat: number
  words: string[]
}

export interface ObjectColourSummary {
  answers: number
  /** Share of answers with an object colour. */
  mentioned: number
  /** Object-colour phrases per answer. */
  wordsPerAnswer: number
}

export function summariseObjectColours(checks: ObjectColourCheck[]): ObjectColourSummary {
  const n = checks.length
  return {
    answers: n,
    mentioned: n === 0 ? 0 : checks.filter((c) => c.words.length > 0).length / n,
    wordsPerAnswer: n === 0 ? 0 : checks.reduce((t, c) => t + c.words.length, 0) / n
  }
}
