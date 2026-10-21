import { describe, expect, it } from 'vitest'
import { createTagSnapper, tagsColumn } from './searchable-tags'

describe('createTagSnapper', () => {
  it('snaps to the seed labels and categories, whatever the casing', async () => {
    const snap = createTagSnapper()
    expect(
      await snap([
        { category: 'device', label: 'iphone' },
        { category: 'Apparel', label: 'tote-bag' }
      ])
    ).toEqual([
      { category: 'Device', label: 'iPhone' },
      { category: 'Apparel', label: 'Tote bag' }
    ])
  })

  it('keeps a new label as written, and a later spelling of it snaps to that one', async () => {
    const snap = createTagSnapper()
    expect(await snap([{ category: 'Print & Branding', label: '  Snack  wrapper ' }])).toEqual([
      { category: 'Print & Branding', label: 'Snack wrapper' }
    ])
    expect(await snap([{ category: 'Print & Branding', label: 'snack_wrapper' }])).toEqual([
      { category: 'Print & Branding', label: 'Snack wrapper' }
    ])
  })

  it('drops repeats', async () => {
    const snap = createTagSnapper()
    expect(
      await snap([
        { category: 'Angle', label: 'Front' },
        { category: 'Angle', label: 'front' }
      ])
    ).toEqual([{ category: 'Angle', label: 'Front' }])
  })
})

describe('tagsColumn', () => {
  it('joins the labels with spaces, as the search index stores them', () => {
    expect(
      tagsColumn([
        { category: 'Device', label: 'iPhone' },
        { category: 'Environment', label: 'Flat lay' }
      ])
    ).toBe('iPhone Flat lay')
  })
})
