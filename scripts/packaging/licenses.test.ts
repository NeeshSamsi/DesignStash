import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')

// The fonts are bundled into the app, and the SIL Open Font License has to travel with them.
describe('bundled font licences', () => {
  const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> }
  const fonts = Object.keys(pkg.dependencies)
    .filter((name) => name.startsWith('@fontsource-variable/'))
    .map((name) => name.split('/')[1]!)
  // funnel-sans → FunnelSans-OFL.txt
  const fileFor = (font: string) =>
    `${font.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}-OFL.txt`

  it('ships a licence for every bundled font and none for a font the app no longer has', () => {
    expect(fonts.length).toBeGreaterThan(0)
    expect(readdirSync(resolve(ROOT, 'licenses/fonts')).sort()).toEqual(fonts.map(fileFor).sort())
  })

  it.each(fonts)('keeps %s’s licence identical to the one in its package', (font) => {
    expect(read(`licenses/fonts/${fileFor(font)}`)).toBe(
      read(`node_modules/@fontsource-variable/${font}/LICENSE`)
    )
  })

  it('copies the licences into the packaged app', () => {
    expect(read('electron-builder.yml')).toMatch(/- from: licenses\n\s+to: licenses\n/)
  })
})
