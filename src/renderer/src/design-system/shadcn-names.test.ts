import { describe, expect, it } from 'vitest'

// Figma's text/secondary shares its name with shadcn's `secondary`, which is a surface colour.
// `text-secondary` therefore paints text in a background colour, unreadable on dark surfaces.
// The class for Figma's text/secondary is `text-muted-foreground` (design/README.md).

const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true
})

const CLASH = /(?<![a-z-])text-secondary(?![a-z-])/

describe('shadcn name clashes', () => {
  it('never uses text-secondary for secondary text', () => {
    const offenders = Object.entries(sources)
      .filter(([path, text]) => !path.endsWith('shadcn-names.test.ts') && CLASH.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
