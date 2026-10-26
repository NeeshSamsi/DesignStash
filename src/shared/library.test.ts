import { describe, expect, it } from 'vitest'
import { LibraryItemSchema, coverDisplay } from './library'

describe('coverDisplay', () => {
  it('shows a missing file before anything else', () => {
    expect(coverDisplay({ coverMissing: true, coverSource: 'none' }, true)).toBe('cover-missing')
  })

  it('shows no preview before selection', () => {
    expect(coverDisplay({ coverMissing: false, coverSource: 'none' }, true)).toBe('no-preview')
  })

  it('falls back to selected or default', () => {
    const item = { coverMissing: false, coverSource: 'embedded' } as const
    expect(coverDisplay(item, true)).toBe('selected')
    expect(coverDisplay(item)).toBe('default')
  })
})

describe('LibraryItemSchema pile', () => {
  const base = {
    id: 1,
    title: 'a',
    description: null,
    coverPath: '/c.webp',
    coverSource: 'embedded',
    coverMissing: false,
    favourite: false,
    createdAt: '2026-01-01',
    tags: [],
    pileId: null,
    variation: null
  }

  it('is null for a mockup on its own and a size for a pile', () => {
    expect(LibraryItemSchema.parse({ ...base, pile: null }).pile).toBeNull()
    expect(LibraryItemSchema.parse({ ...base, pile: { memberCount: 3 } }).pile).toEqual({
      memberCount: 3
    })
  })

  it('has no isGroup, variantCount or topId to disagree with it', () => {
    const parsed = LibraryItemSchema.parse({
      ...base,
      pile: null,
      isGroup: true,
      variantCount: 4,
      topId: 1
    })
    expect(Object.keys(parsed)).not.toEqual(
      expect.arrayContaining(['isGroup', 'variantCount', 'topId'])
    )
    expect(parsed).not.toHaveProperty('isGroup')
  })

  it('needs the field', () => {
    expect(LibraryItemSchema.safeParse(base).success).toBe(false)
  })
})
