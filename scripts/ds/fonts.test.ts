import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM helper with no types
import { fontFamilies, fontStack, fontVariable, weightOf } from './fonts.mjs'

const style = (name: string, family: string, weight = 'Regular') => ({
  name,
  family,
  style: weight
})

const STYLES = [
  style('display/3xl/semibold', 'Unbounded', 'SemiBold'),
  style('title/lg/semibold', 'Unbounded', 'SemiBold'),
  style('body/base/regular', 'Funnel Sans'),
  style('label/xs/medium', 'Funnel Sans', 'Medium')
]

describe('weightOf', () => {
  it('reads both Inter’s spaced names and the unspaced names newer fonts use', () => {
    expect(weightOf('Semi Bold')).toBe(600)
    expect(weightOf('SemiBold')).toBe(600)
    expect(weightOf('Extra Bold')).toBe(800)
    expect(weightOf('ExtraBold')).toBe(800)
    expect(weightOf('Extra Light')).toBe(200)
    expect(weightOf('ExtraLight')).toBe(200)
    expect(weightOf('Medium')).toBe(500)
  })

  it('falls back to regular for a name it does not know', () => {
    expect(weightOf('Book')).toBe(400)
  })
})

describe('fontFamilies', () => {
  it('takes the display family from the display styles and the body family from the body styles', () => {
    expect(fontFamilies(STYLES)).toEqual({ display: 'Unbounded', body: 'Funnel Sans' })
  })

  it('uses the body family for display when there are no display styles', () => {
    expect(fontFamilies(STYLES.slice(2))).toEqual({ display: 'Funnel Sans', body: 'Funnel Sans' })
  })
})

describe('fontVariable', () => {
  const families = fontFamilies(STYLES)

  it('sets any style in the display family in the display font, titles included', () => {
    expect(fontVariable(STYLES[0], families)).toBe('--ds-font-display')
    expect(fontVariable(STYLES[1], families)).toBe('--ds-font-display')
  })

  it('sets every other style in the body font', () => {
    expect(fontVariable(STYLES[2], families)).toBe('--ds-font-body')
    expect(fontVariable(style('display/2xl/regular', 'Funnel Sans'), families)).toBe(
      '--ds-font-body'
    )
  })

  it('keeps display styles on the display variable when both families are the same', () => {
    const one = { display: 'Inter', body: 'Inter' }
    expect(fontVariable(style('display/3xl/semibold', 'Inter'), one)).toBe('--ds-font-display')
    expect(fontVariable(style('title/lg/semibold', 'Inter'), one)).toBe('--ds-font-body')
  })
})

describe('fontStack', () => {
  it('puts the bundled variable font first', () => {
    expect(fontStack('Unbounded')).toBe(
      "'Unbounded Variable', 'Unbounded', ui-sans-serif, system-ui, sans-serif"
    )
  })

  it.each([
    ['Unbounded', 'unbounded'],
    ['Funnel Sans', 'funnel-sans']
  ])('names %s the way its @fontsource-variable package registers it', (family, pkg) => {
    const css = readFileSync(
      resolve(import.meta.dirname, `../../node_modules/@fontsource-variable/${pkg}/index.css`),
      'utf8'
    )
    const registered = new Set([...css.matchAll(/font-family: '([^']+)'/g)].map((m) => m[1]))
    const bundled = fontStack(family).split(', ')[0].replace(/'/g, '')
    expect([...registered]).toEqual([bundled])
  })
})
