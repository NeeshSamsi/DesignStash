import { describe, expect, it } from 'vitest'
import { CATALOG } from './catalog.generated'
import { SCREENS } from './screens.generated'
import { TOKENS } from './tokens.generated'
import * as barrel from '@renderer/components'

// Guards the Figma → code contract. If this fails, the snapshot in design/figma changed:
// run `pnpm ds` (tokens + scaffold) and fill in whatever the scaffold adds.

const snapshots = import.meta.glob<string>('../../../../design/figma/*.json', {
  query: '?raw',
  import: 'default',
  eager: true
})

const snapshot = <T>(name: string): T =>
  JSON.parse(snapshots[`../../../../design/figma/${name}`] ?? '') as T

interface FigmaComponent {
  name: string
  retired?: boolean
  figmaId: string
  variants: Record<string, string[]>
}

const FIGMA_ONLY = new Set(['ContentSlot', 'ModalLayer'])
const pascal = (s: string) =>
  s
    .replace(/[^A-Za-z0-9]+(.)?/g, (_: string, c?: string) => (c ? c.toUpperCase() : ''))
    .replace(/^./, (c) => c.toUpperCase())

const figma = snapshot<{ components: FigmaComponent[] }>('components.json').components.filter(
  (c) => !FIGMA_ONLY.has(c.name) && !c.retired
)
const byName = new Map(CATALOG.map((e) => [e.contract.name, e]))
// Axes whose code prop has another name (OVERRIDES.axisNames in scripts/ds/contract.mjs).
const AXIS_NAMES: Record<string, Record<string, string>> = { Textarea: { rowRange: 'rows' } }

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
        const figmaName = AXIS_NAMES[name]?.[axis] ?? axis
        const figmaAxis = Object.entries(c.variants).find(([k]) => pascal(k) === pascal(figmaName))
        expect(figmaAxis, `${name}.${axis}`).toBeDefined()
        for (const option of options) {
          // A state axis's `default` stands for the options derived from data (empty, filled), as
          // scripts/ds/contract.mjs makes it, so Figma has no option of that name.
          if (axis === 'state' && option === 'default') continue
          expect(figmaAxis?.[1]).toContain(option)
        }
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
