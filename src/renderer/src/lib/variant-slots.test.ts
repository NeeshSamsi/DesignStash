import { describe, expect, it } from 'vitest'
import {
  clampOffset,
  maxOffset,
  offsetToShow,
  overflowState,
  settleOffset,
  stepIndex,
  VARIANT_SLOT_PX
} from './variant-slots'

describe('overflowState', () => {
  it('fits for 2 to 5 variants: no arrows', () => {
    for (const count of [1, 2, 3, 4, 5]) expect(overflowState(0, count)).toBe('fits')
  })

  it('is start, scrolled or end for a longer strip', () => {
    expect(overflowState(0, 12)).toBe('start')
    expect(overflowState(4, 12)).toBe('scrolled')
    expect(overflowState(7, 12)).toBe('end')
    expect(overflowState(99, 12)).toBe('end')
  })

  it('treats 6 variants as scrollable by one slot', () => {
    expect(maxOffset(6)).toBe(1)
    expect(overflowState(0, 6)).toBe('start')
    expect(overflowState(1, 6)).toBe('end')
  })
})

describe('clampOffset', () => {
  it('stays within the strip and on a whole slot', () => {
    expect(clampOffset(-3, 12)).toBe(0)
    expect(clampOffset(2.4, 12)).toBe(2)
    expect(clampOffset(2.6, 12)).toBe(3)
    expect(clampOffset(50, 12)).toBe(7)
    expect(clampOffset(3, 4)).toBe(0)
  })
})

describe('settleOffset', () => {
  it('settles a drag on the nearest slot', () => {
    expect(settleOffset(2, VARIANT_SLOT_PX * 1.4, 12)).toBe(3)
    expect(settleOffset(2, VARIANT_SLOT_PX * 1.6, 12)).toBe(4)
    expect(settleOffset(2, -VARIANT_SLOT_PX * 0.4, 12)).toBe(2)
    expect(settleOffset(2, -VARIANT_SLOT_PX * 0.6, 12)).toBe(1)
  })

  it('does not run past either end', () => {
    expect(settleOffset(0, -1000, 12)).toBe(0)
    expect(settleOffset(7, 1000, 12)).toBe(7)
  })
})

describe('stepIndex', () => {
  it('steps and stops at the ends', () => {
    expect(stepIndex(3, 1, 12)).toBe(4)
    expect(stepIndex(3, -1, 12)).toBe(2)
    expect(stepIndex(0, -1, 12)).toBe(0)
    expect(stepIndex(11, 1, 12)).toBe(11)
  })
})

describe('offsetToShow', () => {
  it('leaves a variant that is already in a clear slot', () => {
    expect(offsetToShow(2, 0, 12)).toBe(0)
    expect(offsetToShow(0, 0, 12)).toBe(0)
    expect(offsetToShow(5, 4, 12)).toBe(4)
  })

  it('scrolls one slot when stepping onto the faded end', () => {
    // At the start the 5th slot (index 4) is under the right fade.
    expect(offsetToShow(4, 0, 12)).toBe(1)
    // Scrolled: the 1st slot is under the left fade.
    expect(offsetToShow(3, 4, 12)).toBe(2)
  })

  it('walks forward one slot per step through the whole strip', () => {
    let offset = 0
    const seen: number[] = []
    for (let index = 0; index < 12; index += 1) {
      offset = offsetToShow(index, offset, 12)
      seen.push(offset)
    }
    expect(seen).toEqual([0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 7])
  })

  it('walks back the same way', () => {
    let offset = 7
    const seen: number[] = []
    for (let index = 11; index >= 0; index -= 1) {
      offset = offsetToShow(index, offset, 12)
      seen.push(offset)
    }
    expect(seen).toEqual([7, 7, 7, 7, 6, 5, 4, 3, 2, 1, 0, 0])
  })

  it('brings a distant variant into a clear slot, clamped to the strip', () => {
    expect(offsetToShow(6, 0, 12)).toBe(3)
    expect(offsetToShow(11, 0, 12)).toBe(7)
    expect(offsetToShow(0, 7, 12)).toBe(0)
  })

  it('does nothing for a strip that fits', () => {
    for (let index = 0; index < 4; index += 1) expect(offsetToShow(index, 0, 4)).toBe(0)
  })
})
