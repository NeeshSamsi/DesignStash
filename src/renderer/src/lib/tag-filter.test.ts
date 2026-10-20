import { describe, expect, it } from 'vitest'
import {
  categoryCounts,
  filterTags,
  matchesFilter,
  narrowToCategory,
  toLibraryFilter,
  toggleTagId,
  totalTagCount,
  type FilterCategory
} from './tag-filter'

const CATEGORIES: FilterCategory[] = [
  {
    categoryId: 1,
    categoryLabel: 'Device',
    tags: [
      { tagId: 10, label: 'iPhone', count: 24 },
      { tagId: 11, label: 'iPhone 15 Pro', count: 12 },
      { tagId: 12, label: 'iPad', count: 8 }
    ]
  },
  {
    categoryId: 2,
    categoryLabel: 'Style',
    tags: [
      { tagId: 20, label: 'Clay', count: 12 },
      { tagId: 21, label: 'Glass', count: 7 }
    ]
  },
  { categoryId: 3, categoryLabel: 'Colour', tags: [{ tagId: 30, label: 'Clear', count: 2 }] },
  { categoryId: 4, categoryLabel: 'Empty category', tags: [] }
]

describe('filterTags', () => {
  it('keeps every tag for an empty query and drops categories with no tags', () => {
    const result = filterTags(CATEGORIES, '')
    expect(result.map((c) => c.categoryLabel)).toEqual(['Device', 'Style', 'Colour'])
    expect(totalTagCount(result)).toBe(6)
  })

  it('filters live, case-insensitively and by partial name', () => {
    const result = filterTags(CATEGORIES, '  CL ')
    expect(result.map((c) => [c.categoryLabel, c.tags.map((t) => t.label)])).toEqual([
      ['Style', ['Clay']],
      ['Colour', ['Clear']]
    ])
  })

  it('finds “iPhone” and “iPhone 15 Pro” together, flat under one category', () => {
    const [device] = filterTags(CATEGORIES, 'iphone')
    expect(device!.tags.map((t) => t.label)).toEqual(['iPhone', 'iPhone 15 Pro'])
  })

  it('removes categories with no match, and returns nothing when nothing matches', () => {
    expect(filterTags(CATEGORIES, 'xyz')).toEqual([])
  })

  it('does not mutate its input', () => {
    const before = JSON.stringify(CATEGORIES)
    filterTags(CATEGORIES, 'cl')
    expect(JSON.stringify(CATEGORIES)).toBe(before)
  })
})

describe('categoryCounts', () => {
  it('counts the tags that match in each category, following the search', () => {
    expect(categoryCounts(filterTags(CATEGORIES, ''))).toEqual([
      { categoryId: 1, categoryLabel: 'Device', count: 3 },
      { categoryId: 2, categoryLabel: 'Style', count: 2 },
      { categoryId: 3, categoryLabel: 'Colour', count: 1 }
    ])
    expect(categoryCounts(filterTags(CATEGORIES, 'cl')).map((c) => c.count)).toEqual([1, 1])
  })
})

describe('narrowToCategory', () => {
  const all = filterTags(CATEGORIES, '')

  it('shows everything for All (null)', () => {
    expect(narrowToCategory(all, null)).toHaveLength(3)
  })

  it('narrows to the category from its pill', () => {
    expect(narrowToCategory(all, 2).map((c) => c.categoryLabel)).toEqual(['Style'])
  })

  it('falls back to everything when the search emptied that category', () => {
    expect(narrowToCategory(filterTags(CATEGORIES, 'iphone'), 2).map((c) => c.categoryLabel)).toEqual([
      'Device'
    ])
  })
})

describe('toggleTagId', () => {
  it('adds and removes without mutating', () => {
    const start = [1, 2]
    expect(toggleTagId(start, 3)).toEqual([1, 2, 3])
    expect(toggleTagId(start, 2)).toEqual([1])
    expect(start).toEqual([1, 2])
  })
})

describe('toLibraryFilter', () => {
  it('leaves empty lists out', () => {
    expect(toLibraryFilter({ tagIds: [], categoryIds: [] })).toEqual({})
    expect(toLibraryFilter({ tagIds: [10], categoryIds: [] })).toEqual({ tagIds: [10] })
    expect(toLibraryFilter({ tagIds: [], categoryIds: [2] })).toEqual({ categoryIds: [2] })
  })
})

describe('matchesFilter', () => {
  const byCategory = new Map<number, number[]>([
    [1, [10, 11, 12]],
    [2, [20, 21]]
  ])
  const pick = (tagIds: number[], categoryIds: number[] = []) => ({ tagIds, categoryIds })

  it('matches everything when nothing is picked', () => {
    expect(matchesFilter([], byCategory, pick([]))).toBe(true)
  })

  it('requires every picked tag (AND)', () => {
    expect(matchesFilter([10, 20], byCategory, pick([10, 20]))).toBe(true)
    expect(matchesFilter([10], byCategory, pick([10, 20]))).toBe(false)
  })

  it('a category filter includes all its tags', () => {
    expect(matchesFilter([11], byCategory, pick([], [1]))).toBe(true)
    expect(matchesFilter([12], byCategory, pick([], [1]))).toBe(true)
    expect(matchesFilter([20], byCategory, pick([], [1]))).toBe(false)
  })

  it('categories AND together, and with picked tags', () => {
    expect(matchesFilter([10, 20], byCategory, pick([], [1, 2]))).toBe(true)
    expect(matchesFilter([10], byCategory, pick([], [1, 2]))).toBe(false)
    expect(matchesFilter([11, 20], byCategory, pick([11], [2]))).toBe(true)
    expect(matchesFilter([10, 20], byCategory, pick([11], [2]))).toBe(false)
  })

  it('a category with no known tags matches nothing', () => {
    expect(matchesFilter([10], byCategory, pick([], [9]))).toBe(false)
  })
})
