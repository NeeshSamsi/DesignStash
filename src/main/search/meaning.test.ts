import { describe, it, expect } from 'vitest'
import {
  MEANING_FLOOR,
  appendMeaningHits,
  cosine,
  documentHash,
  meaningDocument,
  meaningHits,
  normalise
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
