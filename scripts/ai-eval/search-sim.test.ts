import { describe, expect, it } from 'vitest'
import { SearchSim } from './search-sim'

const items = [
  {
    id: 'tote',
    title: 'Tote bag on a floor',
    description: 'A canvas tote.',
    tags: [{ category: 'Apparel', label: 'Tote bag' }]
  },
  {
    id: 'cap',
    title: 'Cap, front',
    description: 'A baseball cap.',
    tags: [{ category: 'Apparel', label: 'Cap' }]
  },
  {
    id: 'shirt',
    title: 'Folded shirt',
    description: 'A shirt and a tote bag.',
    tags: [{ category: 'Apparel', label: 'T-shirt' }]
  }
]

describe('SearchSim', () => {
  it('prefix-matches title, description and tags, best match first', () => {
    const sim = new SearchSim(items, { synonyms: false })
    expect(sim.search('tote').ids).toEqual(['tote', 'shirt'])
    expect(sim.search('ca').ids).toEqual(['cap', 'tote'])
    sim.close()
  })

  it('finds an item by a word that is only in its keywords', () => {
    const sim = new SearchSim([
      ...items.slice(0, 2),
      { ...items[2]!, keywords: ['apparel', 'garment'] }
    ])
    expect(sim.search('garment').ids).toEqual(['shirt'])
    expect(sim.search('tote').ids).toEqual(['tote', 'shirt'])
    sim.close()
  })

  it('returns nothing for a query with no searchable words', () => {
    const sim = new SearchSim(items)
    expect(sim.search('!!')).toEqual({ ids: [] })
    sim.close()
  })

  it('finds a hyphenated word the way the app does, as a phrase', () => {
    const sim = new SearchSim(items)
    expect(sim.search('t-shirt')).toEqual({ ids: ['shirt'] })
    sim.close()
  })

  it('adds synonyms as hidden words unless they are turned off', () => {
    const on = new SearchSim(items)
    expect(on.search('shopping bag').ids).toContain('tote')
    on.close()
    const off = new SearchSim(items, { synonyms: false })
    expect(off.search('shopping bag').ids).toEqual([])
    off.close()
  })
})
