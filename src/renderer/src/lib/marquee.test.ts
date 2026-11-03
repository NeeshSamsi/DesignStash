import { describe, expect, it } from 'vitest'
import { exceedsDragThreshold, marqueeHits, marqueeRect, rectsIntersect } from './marquee'

const card = (id: string, left: number, top: number) => ({
  id,
  rect: { left, top, right: left + 100, bottom: top + 100 }
})

describe('marqueeRect', () => {
  it('normalises a drag in any direction', () => {
    const expected = { left: 10, top: 20, right: 50, bottom: 80 }
    expect(marqueeRect({ x: 10, y: 20 }, { x: 50, y: 80 })).toEqual(expected)
    expect(marqueeRect({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual(expected)
    expect(marqueeRect({ x: 50, y: 20 }, { x: 10, y: 80 })).toEqual(expected)
  })
})

describe('rectsIntersect', () => {
  const box = { left: 0, top: 0, right: 100, bottom: 100 }

  it('is true for overlapping and contained rectangles', () => {
    expect(rectsIntersect(box, { left: 50, top: 50, right: 150, bottom: 150 })).toBe(true)
    expect(rectsIntersect(box, { left: 10, top: 10, right: 20, bottom: 20 })).toBe(true)
  })

  it('is false for apart rectangles and for edges that only touch', () => {
    expect(rectsIntersect(box, { left: 200, top: 0, right: 300, bottom: 100 })).toBe(false)
    expect(rectsIntersect(box, { left: 100, top: 0, right: 200, bottom: 100 })).toBe(false)
    expect(rectsIntersect(box, { left: 0, top: 100, right: 100, bottom: 200 })).toBe(false)
  })
})

describe('marqueeHits', () => {
  const targets = [card('a', 0, 0), card('b', 116, 0), card('c', 0, 116), card('d', 116, 116)]

  it('returns every card the box touches, in grid order', () => {
    const box = marqueeRect({ x: 90, y: 90 }, { x: 130, y: 130 })
    expect(marqueeHits(box, targets)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('skips cards the box misses', () => {
    const box = marqueeRect({ x: 10, y: 10 }, { x: 60, y: 60 })
    expect(marqueeHits(box, targets)).toEqual(['a'])
  })

  it('returns nothing for a box over empty space', () => {
    const box = marqueeRect({ x: 300, y: 300 }, { x: 400, y: 400 })
    expect(marqueeHits(box, targets)).toEqual([])
  })
})

describe('exceedsDragThreshold', () => {
  it('treats small movement as a click', () => {
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false)
  })

  it('treats movement of the threshold or more on either axis as a drag', () => {
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true)
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 0, y: -9 })).toBe(true)
  })
})
