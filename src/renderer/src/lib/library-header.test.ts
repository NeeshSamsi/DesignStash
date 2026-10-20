import { describe, expect, it } from 'vitest'
import { filterSummary, libraryDescription } from './library-header'

const base = { view: 'all', shown: 12, total: 12, starred: 3, query: '', chips: [] } as const

describe('libraryDescription', () => {
  it('counts the view at rest', () => {
    expect(libraryDescription(base)).toBe('12 mockups')
    expect(libraryDescription({ ...base, total: 1 })).toBe('1 mockup')
    expect(libraryDescription({ ...base, total: 0 })).toBe('0 mockups')
  })

  it('counts favourites in Starred', () => {
    expect(libraryDescription({ ...base, view: 'starred' })).toBe('3 favourites')
    expect(libraryDescription({ ...base, view: 'starred', starred: 1 })).toBe('1 favourite')
  })

  it('counts the result and names the search', () => {
    expect(libraryDescription({ ...base, shown: 6, query: ' macbook ' })).toBe(
      '6 results for “macbook”'
    )
    expect(libraryDescription({ ...base, shown: 1, query: 'x' })).toBe('1 result for “x”')
  })

  it('says what a filter narrowed to', () => {
    const chips = [{ category: 'Device', label: 'iPhone' }]
    expect(libraryDescription({ ...base, shown: 4, chips })).toBe(
      '4 mockups · filtered by Device · iPhone'
    )
    expect(libraryDescription({ ...base, shown: 4, query: 'clay', chips })).toBe(
      '4 results for “clay” · filtered by Device · iPhone'
    )
  })
})

describe('filterSummary', () => {
  it('groups tags by category and reads a whole category plainly', () => {
    expect(
      filterSummary([
        { category: 'Device', label: 'iPhone' },
        { category: 'Style', label: 'Clay' },
        { category: 'Device', label: 'MacBook' },
        { label: 'All in Scene' }
      ])
    ).toBe('all of Scene; Device · iPhone, MacBook; Style · Clay')
  })
})
