import { describe, it, expect } from 'vitest'
import {
  MEANING_DIMENSIONS,
  MEANING_FLOOR,
  appendMeaningHits,
  compactCosine,
  compactVector,
  cosine,
  documentHash,
  meaningDocument,
  meaningHits,
  normalise,
  shortVector
} from './meaning'

describe('meaningDocument', () => {
  it('joins title, description and each tag label with ". ", leaving out the empty ones', () => {
    expect(meaningDocument('Tote bag', 'A canvas bag.', ['Bag', 'Canvas'])).toBe(
      'Tote bag. A canvas bag.. Bag. Canvas'
    )
    expect(meaningDocument('Tote bag', '', [])).toBe('Tote bag')
  })

  it('has a stable hash that changes with the text', () => {
    expect(documentHash('a')).toBe(documentHash('a'))
    expect(documentHash('a')).not.toBe(documentHash('b'))
  })
})

describe('cosine', () => {
  it('is the dot product of unit vectors', () => {
    expect(cosine(normalise([3, 4]), normalise([3, 4]))).toBeCloseTo(1)
    expect(cosine(normalise([1, 0]), normalise([0, 1]))).toBeCloseTo(0)
  })
})

describe('meaningHits', () => {
  const sims = new Map([
    [1, 0.9],
    [2, 0.7],
    [3, 0.56],
    [4, 0.54]
  ])

  it('keeps the closest `top` items at or above the floor, closest first', () => {
    expect(meaningHits(sims, { floor: MEANING_FLOOR, top: 1 })).toEqual([1])
    expect(meaningHits(sims, { floor: MEANING_FLOOR, top: 3 })).toEqual([1, 2, 3])
  })

  it('is empty when nothing reaches the floor', () => {
    expect(meaningHits(new Map([[1, 0.3]]), { floor: MEANING_FLOOR, top: 1 })).toEqual([])
  })
})

describe('appendMeaningHits', () => {
  it('puts the keyword hits first and adds the meaning hit after them', () => {
    expect(appendMeaningHits([5, 6], [9])).toEqual([5, 6, 9])
  })

  it('with no keyword hits, the meaning hit is the only result', () => {
    expect(appendMeaningHits([], [9])).toEqual([9])
  })

  it('leaves out a meaning hit the keyword search already found', () => {
    expect(appendMeaningHits([5, 9], [9])).toEqual([5, 9])
  })

  it('changes nothing when there are no meaning hits', () => {
    expect(appendMeaningHits([5], [])).toEqual([5])
  })
})

describe('compact vectors (F-070): nomic v1.5 cut to its first 256 numbers, kept as bytes', () => {
  /** A 768-number vector whose meaning sits in its first numbers, as Matryoshka training puts it. */
  const vector = (seed: number) => Array.from({ length: 768 }, (_, i) => Math.sin(seed * (i + 1)) * (i < 256 ? 1 : 0.2))

  it('keeps 256 signed bytes, of unit length within their rounding', () => {
    const c = compactVector(vector(1))
    expect(c).toBeInstanceOf(Int8Array)
    expect(c.length).toBe(MEANING_DIMENSIONS)
    expect(Math.sqrt(c.reduce((t, x) => t + x * x, 0)) / 127).toBeCloseTo(1, 1)
  })

  it('scores the same direction 1 and the opposite -1, from the 768 numbers the model gives', () => {
    const v = vector(2)
    expect(compactCosine(shortVector(v), compactVector(v))).toBeCloseTo(1, 2)
    expect(compactCosine(shortVector(v), compactVector(v.map((x) => -x)))).toBeCloseTo(-1, 2)
  })

  it('keeps the nearer document nearer, and close to its unrounded score', () => {
    const q = vector(3)
    const near = q.map((x, i) => x + 0.3 * Math.sin(7 * i))
    const far = vector(9)
    const query = shortVector(q)
    const [toNear, toFar] = [compactCosine(query, compactVector(near)), compactCosine(query, compactVector(far))]
    expect(toNear).toBeGreaterThan(toFar)
    expect(toNear).toBeCloseTo(cosine(query, shortVector(near)), 2)
  })
})
