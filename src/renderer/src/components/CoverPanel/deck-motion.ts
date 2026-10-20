/**
 * The deck motion when a pile's shown variant changes (design/specs/detail.md, D1.4; Figma frames 751:116972
 * at real speed and 751:117116 at 4x slower). Pure data: `use-deck-motion.ts` plays it.
 *
 * Next: the top card slides 20px left and fades (140ms, ease-in) while the cards behind rise 6px
 * (200ms, ease-out, from 40ms), about 240ms in all; a new card joins at the back. Previous is the
 * reverse (200ms, ease-out). Jumps play one step. Reduced motion is a 120ms crossfade.
 */
export const DECK_MOTION = {
  /** The leaving top card. */
  leaveMs: 140,
  leavePx: 20,
  leaveEasing: 'ease-in',
  /** The cards behind rising into the next slot. */
  riseMs: 200,
  riseDelayMs: 40,
  risePx: 6,
  riseEasing: 'ease-out',
  /** The card that joins the back of the deck. */
  joinMs: 120,
  joinDelayMs: 100,
  /** Going back plays the reverse in one 200ms ease-out. */
  previousMs: 200,
  /** Reduced motion, and the detail form's own crossfade. */
  crossfadeMs: 120
} as const

export type DeckDirection = 'next' | 'previous'
export type DeckTarget = 'ghost' | 'cover' | 'deck1' | 'deck2'

export interface DeckStep {
  target: DeckTarget
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
}

/** A jump of any distance plays one step, in the direction it went. */
export function deckDirection(
  from: number | undefined,
  to: number | undefined
): DeckDirection | null {
  if (from === undefined || to === undefined || from === to) return null
  return to > from ? 'next' : 'previous'
}

const at = (x: number, y = x) => `translate(${x}px, ${y}px)`

/**
 * What to animate for one switch. The keyframes only name the start (and the leaving card's end): each
 * element's own styles are the finish, so cancelling an animation lands on the end state. That is what
 * keeps key presses from queuing: a new press cancels the running steps and starts again from there.
 * `deck1` and `deck2` are the cards behind the cover; leave them out when the deck isn't shown.
 */
export function deckSteps(
  direction: DeckDirection,
  options: { reducedMotion: boolean; deck1: boolean; deck2: boolean }
): DeckStep[] {
  const m = DECK_MOTION
  if (options.reducedMotion) {
    return [
      {
        target: 'cover',
        keyframes: [{ opacity: 0 }, { opacity: 1 }],
        options: { duration: m.crossfadeMs, easing: 'linear', fill: 'backwards' }
      }
    ]
  }

  if (direction === 'next') {
    const steps: DeckStep[] = [
      {
        target: 'ghost',
        keyframes: [
          { opacity: 1, transform: at(0) },
          { opacity: 0, transform: at(-m.leavePx, 0) }
        ],
        options: { duration: m.leaveMs, easing: m.leaveEasing, fill: 'both' }
      },
      {
        target: 'cover',
        keyframes: [{ transform: at(m.risePx) }, { transform: at(0) }],
        options: {
          duration: m.riseMs,
          delay: m.riseDelayMs,
          easing: m.riseEasing,
          fill: 'backwards'
        }
      }
    ]
    if (options.deck1) {
      steps.push({
        target: 'deck1',
        keyframes: [{ transform: at(m.risePx) }, { transform: at(0) }],
        options: {
          duration: m.riseMs,
          delay: m.riseDelayMs,
          easing: m.riseEasing,
          fill: 'backwards'
        }
      })
    }
    if (options.deck2) {
      steps.push({
        target: 'deck2',
        keyframes: [{ opacity: 0 }, { opacity: 1 }],
        options: {
          duration: m.joinMs,
          delay: m.joinDelayMs,
          easing: m.riseEasing,
          fill: 'backwards'
        }
      })
    }
    return steps
  }

  const steps: DeckStep[] = [
    {
      target: 'cover',
      keyframes: [
        { opacity: 0, transform: at(-m.leavePx, 0) },
        { opacity: 1, transform: at(0) }
      ],
      options: { duration: m.previousMs, easing: m.riseEasing, fill: 'backwards' }
    }
  ]
  for (const target of ['deck1', 'deck2'] as const) {
    if (!options[target]) continue
    steps.push({
      target,
      keyframes: [{ transform: at(-m.risePx) }, { transform: at(0) }],
      options: { duration: m.previousMs, easing: m.riseEasing, fill: 'backwards' }
    })
  }
  return steps
}

/** When the whole switch has finished: the longest step, delay included. */
export function deckDurationMs(steps: readonly DeckStep[]): number {
  return Math.max(
    0,
    ...steps.map((step) => Number(step.options.duration ?? 0) + Number(step.options.delay ?? 0))
  )
}
