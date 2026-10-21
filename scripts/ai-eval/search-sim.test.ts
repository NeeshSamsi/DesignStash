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
    const sim = new SearchSim(items)
    expect(sim.search('tote').ids).toEqual(['tote', 'shirt'])
    expect(sim.search('ca').ids).toEqual(['cap', 'tote'])
    sim.close()
  })

  it('returns nothing for a query with no searchable words', () => {
    const sim = new SearchSim(items)
    expect(sim.search('!!')).toEqual({ ids: [] })
    sim.close()
  })

  it('passes back the error the app would hit on a hyphenated word', () => {
    const sim = new SearchSim(items)
    expect(sim.search('t-shirt')).toEqual({ ids: [], error: 'no such column: shirt' })
    sim.close()
  })
})
