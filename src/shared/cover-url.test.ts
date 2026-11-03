import { describe, it, expect } from 'vitest'
import { coverUrl, pathFromCoverUrl } from './cover-url'

const awkward = [
  '/Users/me/Library/Application Support/designstash/Library/mockups/abc/cover.webp',
  '/tmp/Application Support #1 100%/Library/mockups/x/cover.webp',
  '/lib/what?.webp',
  '/lib/ünï cödé/封面.webp',
  '/lib/a%2Fb/cover.webp',
  '/lib/a&b=c/cover.webp'
]

describe('coverUrl', () => {
  it.each(awkward)('round-trips %s', (path) => {
    const url = coverUrl(path)
    expect(pathFromCoverUrl(url)).toBe(path)
  })

  it('is one clean address with no raw space, #, ? or % from the path', () => {
    const url = coverUrl('/a b/c#d/e%f?g.webp')
    expect(url.startsWith('stash-cover://cover/')).toBe(true)
    expect(url).not.toMatch(/[ #?](?!v=)/)
    expect(new URL(url).hash).toBe('')
    expect(new URL(url).search).toBe('')
  })

  it('adds a version so a replaced cover loads again, and still decodes to the same path', () => {
    const url = coverUrl('/lib/cover.webp', 3)
    expect(url).toMatch(/\?v=3$/)
    expect(pathFromCoverUrl(url)).toBe('/lib/cover.webp')
    expect(coverUrl('/lib/cover.webp', 0)).not.toContain('?')
  })
})

describe('pathFromCoverUrl', () => {
  it.each(['file:///etc/passwd', 'http://cover/%2Fetc%2Fpasswd', 'stash-cover://other/%2Fa', 'stash-cover://cover/', 'not a url', 'stash-cover://cover/%E0%A4%A'])(
    'refuses %s',
    (url) => {
      expect(pathFromCoverUrl(url)).toBeNull()
    }
  )
})
