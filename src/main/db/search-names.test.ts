import { describe, it, expect } from 'vitest'
import { nameKeywords } from './search-names'

describe('nameKeywords', () => {
  it('splits a file name on separators and camelCase, and drops the extension', () => {
    expect(nameKeywords('Bus-Stop_Citylight.psd', [])).toEqual(['bus', 'stop', 'citylight'])
    expect(nameKeywords('LongScrollWebsite.psd', [])).toEqual(['long', 'scroll', 'website'])
  })

  it('keeps "iPhone" whole and drops a bare number', () => {
    expect(nameKeywords('iPhone 16 hero.psd', [])).toEqual(['iphone', 'hero'])
  })

  it('drops hashes and ids', () => {
    expect(nameKeywords('63db6f047a0e4b24dc6be794.psd', [])).toEqual([])
    expect(nameKeywords('M003T1513_poster.psd', [])).toEqual(['poster'])
  })

  it('drops the junk words of the vision provider and filler', () => {
    expect(nameKeywords('free-mockup-template_final_copy.psd', [])).toEqual([])
    expect(nameKeywords('Scene Preview version file.psd', [])).toEqual([])
  })

  it('reads the folder trail the same way, without cutting an extension', () => {
    expect(nameKeywords('a1.psd', ['Billboard Set', 'rocks.v2'])).toEqual([
      'billboard',
      'set',
      'rocks'
    ])
  })

  it('splits at other punctuation too', () => {
    expect(nameKeywords('Top&Leggings, Clay.psd', [])).toEqual(['top', 'leggings', 'clay'])
  })

  it('does not repeat a word', () => {
    expect(nameKeywords('box_box.psd', ['Box'])).toEqual(['box'])
  })
})
