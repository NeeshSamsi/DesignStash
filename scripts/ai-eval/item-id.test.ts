import { describe, expect, it } from 'vitest'
import { itemIds, slugify } from './item-id'

describe('slugify', () => {
  it('makes plain ASCII words joined by dashes', () => {
    expect(slugify('Café Mockup été')).toBe('cafe-mockup-ete')
    expect(slugify('  Matte Snack Bar Mockup ')).toBe('matte-snack-bar-mockup')
  })

  it('drops letters it cannot spell in ASCII', () => {
    // The Cyrillic "С" in one of the real Apple Watch file names.
    expect(slugify('Apple Watch Ultra Сlay')).toBe('apple-watch-ultra-lay')
  })

  it('cuts a long name at a word break', () => {
    const id = slugify('M003T1514 A long scroll Macbook Mockup 08Agu25 with a longer tail')
    expect(id.length).toBeLessThanOrEqual(48)
    expect(id).toBe('m003t1514-a-long-scroll-macbook-mockup-08agu25')
  })
})

describe('itemIds', () => {
  it('comes from the cleaned file name, without the stock ID prefix', () => {
    expect(itemIds([{ fileName: 'y1PjyY3rTTWYuCfHXkQo_Tape-Mockup.psd' }])).toEqual([
      'tape-mockup'
    ])
  })

  it('falls back to the zip name when the file name says nothing', () => {
    expect(itemIds([{ fileName: 'Mockup.psd', zip: 'Free_Cap_Mockup.zip' }])).toEqual([
      'free-cap-mockup'
    ])
    expect(itemIds([{ fileName: '011.psd', zip: '011.zip' }])).toEqual(['011'])
    expect(itemIds([{ fileName: 'PSD.psd' }])).toEqual(['psd'])
    expect(itemIds([{ fileName: '.psd' }])).toEqual(['item'])
  })

  it('numbers repeats in the order given', () => {
    expect(
      itemIds([
        { fileName: 'Tote Bag.psd' },
        { fileName: 'Tote_Bag.psd' },
        { fileName: 'tote-bag.psd' }
      ])
    ).toEqual(['tote-bag', 'tote-bag-2', 'tote-bag-3'])
  })
})
