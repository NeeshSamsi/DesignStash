import { describe, it, expect } from 'vitest'
import { searchKeywords } from './search-keywords'

describe('searchKeywords', () => {
  it('adds the other names for a word in the title', () => {
    expect(searchKeywords('Tote bag mockup', '', [])).toEqual(
      expect.arrayContaining(['shopping bag', 'canvas bag', 'shopper', 'bags'])
    )
  })

  it('reads the description and tag labels too', () => {
    expect(searchKeywords('Mockup', 'A cardboard box on a table', [])).toContain('packaging')
    expect(searchKeywords('Mockup', '', ['Notebook'])).toContain('stationery')
  })

  it('matches case-insensitively and with a plural s', () => {
    expect(searchKeywords('NOTEBOOKS', '', [])).toContain('stationery')
    expect(searchKeywords('Wooden boxes', '', [])).toContain('packaging')
  })

  it('matches whole words only', () => {
    expect(searchKeywords('Cannon camera', '', [])).not.toContain('packaging')
    expect(searchKeywords('Bookmark', '', [])).not.toContain('book cover')
  })

  it('treats a hyphen and a space the same', () => {
    expect(searchKeywords('T shirt on hanger', '', [])).toContain('apparel')
    expect(searchKeywords('Business-card stack', '', [])).toContain('stationery')
  })

  it('does not repeat a word', () => {
    const words = searchKeywords('Box', 'a carton box', ['Packaging box'])
    expect(new Set(words).size).toBe(words.length)
  })

  it('gives nothing for text with no known word', () => {
    expect(searchKeywords('Sunset over hills', '', [])).toEqual([])
  })
})
