import { describe, it, expect } from 'vitest'
import { fuse, type Lever } from './meaning'

const lever = (sims: Record<string, number>, cut: number): Lever => ({
  sims: () => new Map(Object.entries(sims)),
  cut
})

describe('fuse', () => {
  it('returns the keyword results as they are with no meaning lever', () => {
    expect(fuse('cutoff', 'q', ['a', 'b'], [])).toEqual(['a', 'b'])
    expect(fuse('rrf', 'q', ['a', 'b'], [])).toEqual(['a', 'b'])
  })

  it('cutoff: keyword hits first, then meaning hits at or above the cut, closest first', () => {
    const text = lever({ a: 0.9, c: 0.8, d: 0.7, e: 0.2 }, 0.7)
    expect(fuse('cutoff', 'q', ['a', 'b'], [text])).toEqual(['a', 'b', 'c', 'd'])
  })

  it('cutoff: an item found by both meaning levers ranks above one found by a single lever', () => {
    const text = lever({ c: 0.9, d: 0.8 }, 0.5)
    const image = lever({ d: 0.9 }, 0.5)
    expect(fuse('cutoff', 'q', [], [text, image])).toEqual(['d', 'c'])
  })

  it('rrf: an item the keyword list and the meaning list share rises above the rest', () => {
    const text = lever({ b: 0.9, c: 0.8 }, 0.5)
    expect(fuse('rrf', 'q', ['a', 'b'], [text])).toEqual(['b', 'a', 'c'])
  })

  it('rrf: a similarity under the cut adds nothing', () => {
    const text = lever({ z: 0.4 }, 0.5)
    expect(fuse('rrf', 'q', ['a'], [text])).toEqual(['a'])
  })
})
