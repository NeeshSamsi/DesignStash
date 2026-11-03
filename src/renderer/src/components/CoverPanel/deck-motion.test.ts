import { describe, expect, it } from 'vitest'
import { DECK_MOTION, deckDirection, deckDurationMs, deckSteps } from './deck-motion'

const both = { reducedMotion: false, deck1: true, deck2: true }
const step = (steps: ReturnType<typeof deckSteps>, target: string) =>
  steps.find((candidate) => candidate.target === target)

describe('deckDirection', () => {
  it('goes next or previous, whatever the distance', () => {
    expect(deckDirection(2, 3)).toBe('next')
    expect(deckDirection(2, 9)).toBe('next')
    expect(deckDirection(5, 4)).toBe('previous')
    expect(deckDirection(9, 0)).toBe('previous')
  })

  it('plays nothing when nothing changed or there is no index', () => {
    expect(deckDirection(3, 3)).toBeNull()
    expect(deckDirection(undefined, 3)).toBeNull()
    expect(deckDirection(3, undefined)).toBeNull()
  })
})

describe('deckSteps · next', () => {
  const steps = deckSteps('next', both)

  it('slides the top card 20px left and fades it in 140ms, ease-in', () => {
    const ghost = step(steps, 'ghost')!
    expect(ghost.options).toMatchObject({ duration: 140, easing: 'ease-in' })
    expect(ghost.keyframes[0]).toMatchObject({ opacity: 1, transform: 'translate(0px, 0px)' })
    expect(ghost.keyframes[1]).toMatchObject({ opacity: 0, transform: 'translate(-20px, 0px)' })
  })

  it('raises the cards behind 6px in 200ms, ease-out, from 40ms', () => {
    for (const target of ['cover', 'deck1']) {
      const rising = step(steps, target)!
      expect(rising.options).toMatchObject({ duration: 200, delay: 40, easing: 'ease-out' })
      expect(rising.keyframes[0]).toMatchObject({ transform: 'translate(6px, 6px)' })
      expect(rising.keyframes[1]).toMatchObject({ transform: 'translate(0px, 0px)' })
    }
  })

  it('joins a new card at the back', () => {
    const join = step(steps, 'deck2')!
    expect(join.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(join.options).toMatchObject({ duration: 120, delay: 100 })
  })

  it('takes about 240ms in all', () => {
    expect(deckDurationMs(steps)).toBe(240)
    expect(deckDurationMs(steps)).toBe(DECK_MOTION.riseDelayMs + DECK_MOTION.riseMs)
  })

  it('leaves out cards that are not on the deck', () => {
    const none = deckSteps('next', { reducedMotion: false, deck1: false, deck2: false })
    expect(none.map((s) => s.target)).toEqual(['ghost', 'cover'])
  })
})

describe('deckSteps · previous', () => {
  const steps = deckSteps('previous', both)

  it('is the reverse in one 200ms ease-out, with nothing leaving', () => {
    expect(step(steps, 'ghost')).toBeUndefined()
    for (const target of ['cover', 'deck1', 'deck2']) {
      expect(step(steps, target)!.options).toMatchObject({ duration: 200, easing: 'ease-out' })
      expect(step(steps, target)!.options.delay).toBeUndefined()
    }
    expect(step(steps, 'cover')!.keyframes[0]).toMatchObject({
      opacity: 0,
      transform: 'translate(-20px, 0px)'
    })
    expect(step(steps, 'deck1')!.keyframes[0]).toMatchObject({ transform: 'translate(-6px, -6px)' })
    expect(deckDurationMs(steps)).toBe(200)
  })
})

describe('deckSteps · reduced motion', () => {
  it('is a 120ms crossfade, with no movement, either way', () => {
    for (const direction of ['next', 'previous'] as const) {
      const steps = deckSteps(direction, { ...both, reducedMotion: true })
      expect(steps).toHaveLength(1)
      expect(steps[0]!.target).toBe('cover')
      expect(steps[0]!.options.duration).toBe(120)
      expect(JSON.stringify(steps[0]!.keyframes)).not.toContain('transform')
    }
  })
})
