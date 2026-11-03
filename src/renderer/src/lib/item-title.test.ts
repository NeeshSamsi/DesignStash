import { describe, expect, it } from 'vitest'
import { itemName, itemFullTitle } from './item-title'

describe('item titles in a pile (pile-titles.md)', () => {
  it('names a mockup in a pile by its variation on its own, with a capital', () => {
    expect(itemName({ title: 'Clay iPhone 15 Pro', variation: { words: 'side view' } })).toBe(
      'Side view'
    )
  })

  it('names a mockup on its own by its title', () => {
    expect(itemName({ title: 'Poster A3', variation: null })).toBe('Poster A3')
  })

  it('gives the full title, base · variation, where it stands for the mockup alone', () => {
    expect(
      itemFullTitle({ title: 'Long scroll MacBook', variation: { words: 'wavy surface' } })
    ).toBe('Long scroll MacBook · wavy surface')
    expect(itemFullTitle({ title: 'Poster A3', variation: null })).toBe('Poster A3')
  })
})
