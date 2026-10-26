import { describe, expect, it } from 'vitest'
import { badAlternate, withoutBadAlternate } from './placeholder'

const answer = (description: string) => ({ title: 'Lighter on white', description, tags: [{ category: 'Product', label: 'lighter' }] })

describe('withoutBadAlternate', () => {
  it('cuts a vague "also called" name with its commas, so the sentence reads on', () => {
    expect(withoutBadAlternate(answer('A laptop, also called a computer, resting on a stack of paper.')).description).toBe(
      'A laptop resting on a stack of paper.'
    )
    expect(withoutBadAlternate(answer('A paper pouch, also called a packaging item, on a white surface')).description).toBe(
      'A paper pouch on a white surface'
    )
    expect(withoutBadAlternate(answer('A MacBook laptop, also known as a screen device, on a stone')).description).toBe('A MacBook laptop on a stone')
    expect(withoutBadAlternate(answer('A cosmetic tube, also called a product container, rising from smoke')).description).toBe(
      'A cosmetic tube rising from smoke'
    )
  })

  it('cuts one at the end of the sentence', () => {
    expect(withoutBadAlternate(answer('A jam jar on white, also called a container.')).description).toBe('A jam jar on white.')
    expect(withoutBadAlternate(answer('A lighter, also called a prop')).description).toBe('A lighter')
  })

  it('keeps a real other name', () => {
    const kept = 'A flip top lighter, also called a pocket lighter, standing on a white surface.'
    expect(withoutBadAlternate(answer(kept)).description).toBe(kept)
    expect(withoutBadAlternate(answer('An iMac, also called a desktop computer, on white.')).description).toBe(
      'An iMac, also called a desktop computer, on white.'
    )
  })

  it('leaves a vague name that runs on into more words, where a cut would break the sentence', () => {
    const runOn = 'A book, also called a design and a gift, on a table.'
    expect(withoutBadAlternate(answer(runOn)).description).toBe(runOn)
  })

  it('cuts every name the count calls bad, and leaves the title and tags', () => {
    const cut = withoutBadAlternate(answer('A lighter, also called a design, on a light grey surface.'))
    expect(badAlternate(cut.description)).toBeNull()
    expect(cut.title).toBe('Lighter on white')
    expect(cut.tags).toEqual([{ category: 'Product', label: 'lighter' }])
  })
})
