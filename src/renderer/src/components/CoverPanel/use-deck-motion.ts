import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { deckDirection, deckSteps, type DeckTarget } from './deck-motion'

export interface DeckMotionTargets {
  /** The cover well: the card on top of the deck. */
  cover: RefObject<HTMLElement | null>
  /** The old top card, kept only long enough to slide away. Its <img> gets the old cover. */
  ghost: RefObject<HTMLImageElement | null>
  deck1: RefObject<HTMLElement | null>
  deck2: RefObject<HTMLElement | null>
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Plays the deck motion (see deck-motion.ts) whenever the shown variant's index changes.
 * A key press never queues: a new switch cancels whatever is still running, which lands the
 * cards on their end state, and then plays from there. Without the Web Animations API it does nothing.
 */
export function useDeckMotion(
  index: number | undefined,
  coverSrc: string | undefined,
  targets: DeckMotionTargets
) {
  const previousIndex = useRef(index)
  const previousSrc = useRef(coverSrc)
  const running = useRef<Animation[]>([])

  useLayoutEffect(() => {
    const from = previousIndex.current
    previousIndex.current = index
    const direction = deckDirection(from, index)
    if (!direction) return

    for (const animation of running.current) animation.cancel()
    running.current = []

    const cards: Record<DeckTarget, HTMLElement | null> = {
      ghost: targets.ghost.current,
      cover: targets.cover.current,
      deck1: targets.deck1.current,
      deck2: targets.deck2.current
    }
    const steps = deckSteps(direction, {
      reducedMotion: prefersReducedMotion(),
      deck1: cards.deck1 !== null,
      deck2: cards.deck2 !== null
    })

    const ghost = targets.ghost.current
    if (ghost && previousSrc.current) ghost.setAttribute('src', previousSrc.current)
    for (const { target, keyframes, options } of steps) {
      const element = cards[target]
      if (!element || typeof element.animate !== 'function') continue
      // The ghost only has something to show when the old cover is known.
      if (target === 'ghost' && !previousSrc.current) continue
      running.current.push(element.animate(keyframes, options))
    }
  }, [index, targets])

  // After the layout effect has read it, remember this cover as the one a later switch slides away.
  useEffect(() => {
    previousSrc.current = coverSrc
  })

  useEffect(
    () => () => {
      for (const animation of running.current) animation.cancel()
    },
    []
  )
}
