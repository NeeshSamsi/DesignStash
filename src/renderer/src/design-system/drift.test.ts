import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG } from './catalog.generated'
import { SCREENS } from './screens.generated'
import { TOKENS } from './tokens.generated'
import * as barrel from '@renderer/components'

// Guards the Figma → code contract. If this fails, the snapshot in design/figma changed:
// run `pnpm ds` (tokens + scaffold) and fill in whatever the scaffold adds.

const snapshot = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../../design/figma', name), 'utf8')) as T

interface FigmaComponent {
  name: string
  figmaId: string
  variants: Record<string, string[]>
}

const FIGMA_ONLY = new Set(['ContentSlot', 'ModalLayer'])
const pascal = (s: string) =>
  s
    .replace(/[^A-Za-z0-9]+(.)?/g, (_: string, c?: string) => (c ? c.toUpperCase() : ''))
    .replace(/^./, (c) => c.toUpperCase())

const figma = snapshot<{ components: FigmaComponent[] }>('components.json').components.filter(
  (c) => !FIGMA_ONLY.has(c.name)
)
const byName = new Map(CATALOG.map((e) => [e.contract.name, e]))

describe('design-system drift', () => {
  it('has a scaffolded component for every Figma component set', () => {
    expect([...byName.keys()].sort()).toEqual(figma.map((c) => pascal(c.name)).sort())
  })

  it('exports every component from the components barrel', () => {
    for (const name of byName.keys()) expect(barrel).toHaveProperty(name)
  })

  it.each(figma.map((c) => [pascal(c.name), c] as const))(
    '%s matches its Figma node and variant options',
    (name, c) => {
      const contract = byName.get(name)?.contract
      expect(contract?.figmaId).toBe(c.figmaId)
      for (const [axis, options] of Object.entries(contract?.axes ?? {})) {
        const figmaAxis = Object.entries(c.variants).find(([k]) => pascal(k) === pascal(axis))
        expect(figmaAxis, `${name}.${axis}`).toBeDefined()
        for (const option of options) expect(figmaAxis?.[1]).toContain(option)
      }
    }
  )

  it('only references known components from the screen map', () => {
    for (const screen of SCREENS) {
      for (const name of screen.components)
        expect(byName.has(name), `${screen.title} → ${name}`).toBe(true)
    }
  })

  it('has tokens.generated.ts in sync with tokens.json', () => {
    const tokens = snapshot<{
      tokens: { colors: unknown[]; numbers: unknown[] }
      textStyles: unknown[]
    }>('tokens.json')
    expect(TOKENS.colors).toHaveLength(tokens.tokens.colors.length)
    expect(TOKENS.numbers).toHaveLength(tokens.tokens.numbers.length)
    expect(TOKENS.textStyles).toHaveLength(tokens.textStyles.length)
  })
})
