// Figma component-set snapshot → code contract.
// One place for every naming rule so the scaffolder, the generated tests and the
// DEV catalog agree on how a Figma property becomes a React prop.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const ROOT = resolve(import.meta.dirname, '../..')
export const FIGMA_FILE_KEY = 'fB8PHTrzz89lAQOhXbsHMK'

/** Figma-only helpers that are plain ReactNode slots in code, not components. */
export const FIGMA_ONLY = new Set(['ContentSlot', 'ModalLayer'])

/** Visual states that are CSS interactions in code (hover/focus-visible), never props. */
export const INTERACTION_STATES = ['default', 'hover', 'focus', 'pressed']

export const pascal = (s) =>
  s
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^./, (c) => c.toUpperCase())
export const camel = (s) => pascal(s).replace(/^./, (c) => c.toLowerCase())
export const kebab = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase()

export function loadSnapshot(name) {
  return JSON.parse(readFileSync(resolve(ROOT, 'design/figma', name), 'utf8'))
}

export const figmaUrl = (nodeId) =>
  `https://www.figma.com/design/${FIGMA_FILE_KEY}/DesignStash?node-id=${nodeId.replace(':', '-')}`

/**
 * Hand-tuned exceptions to the mechanical rules. Keep this tiny — prefer fixing the
 * Figma property instead.
 *   derive:      state options computed from real data (not props, not previewable)
 *   stateFlag:   name of the boolean a two-option state axis becomes
 *   swapNames:   rename an instance-swap prop (Figma prop → code prop)
 */
export const OVERRIDES = {
  Button: { swapNames: { icon: 'iconStart' } },
  Input: { derive: ['empty', 'filled'], swapNames: { icon: 'iconStart' } },
  Textarea: { derive: ['empty', 'filled'] },
  Switch: { stateFlag: 'checked' },
  FavouriteToggle: { stateFlag: 'pressed' }
}

const pickDefault = (options) => ['base', 'md'].find((o) => options.includes(o)) ?? options[0]

/**
 * Normalise one Figma component set into the code contract.
 *
 * Rules (documented in design/README.md):
 * - variant axes → union props; default = `base`/`md` when present, else the first option
 * - `state` axis:
 *     hover/focus/pressed      → CSS interaction states (ds-hover / ds-focus variants)
 *     disabled                 → `disabled` boolean
 *     two options left         → a boolean named after the second one (default|active → active)
 *     three or more left       → a `state` union prop
 * - booleans / text props → camelCase props with the Figma default
 * - INSTANCE_SWAP icons → `IconSvgElement` props; content swaps → ReactNode slots
 * - exposed nested instances → ReactNode slots
 * - a boolean that collides with a swap/slot name becomes `show<Name>`
 */
export function toContract(c) {
  const name = pascal(c.name)
  const override = OVERRIDES[name] ?? {}
  const axes = {}
  const flags = {}
  const interactionStates = []
  let hasDisabled = false
  for (const [axis, options] of Object.entries(c.variants)) {
    if (axis === 'state') {
      interactionStates.push(
        ...options.filter((o) => INTERACTION_STATES.includes(o) && o !== 'default')
      )
      hasDisabled = options.includes('disabled')
      const derive = override.derive ?? []
      const data = options.filter(
        (o) =>
          o === 'default' ||
          (!INTERACTION_STATES.includes(o) && o !== 'disabled' && !derive.includes(o))
      )
      const real = data.filter((o) => o !== 'default')
      if (real.length === 0) continue
      if (data.length === 2)
        flags[override.stateFlag ?? camel(data[1])] = { on: data[1], off: data[0] }
      else if (data.length > 2) axes.state = data
      // a single drawn state (e.g. DropdownMenu state=open) is just how Figma shows it — no prop
    } else if (options.length >= 2) {
      axes[camel(axis)] = options
    }
  }
  const icons = {}
  const slots = {}
  for (const [prop, swap] of Object.entries(c.swaps)) {
    const key = override.swapNames?.[prop] ?? camel(prop.replace(/-swap$/, ''))
    if (swap.kind === 'icon') icons[key] = swap.default
    else slots[key] = 'content'
  }
  for (const entry of c.exposed) {
    const [prop, component] = entry.split(':')
    slots[camel(prop)] = component
  }
  const booleans = {}
  for (const [prop, def] of Object.entries(c.booleans)) {
    let key = camel(prop)
    if (key in icons || key in slots) key = 'show' + pascal(prop)
    booleans[key] = def
  }
  const texts = {}
  for (const [prop, def] of Object.entries(c.texts)) texts[camel(prop)] = def

  const all = [
    ...Object.keys(axes),
    ...Object.keys(flags),
    ...Object.keys(booleans),
    ...Object.keys(texts),
    ...Object.keys(icons),
    ...Object.keys(slots),
    ...(hasDisabled ? ['disabled'] : []),
    'className',
    'children'
  ]
  const dupes = all.filter((k, i) => all.indexOf(k) !== i)
  if (dupes.length) throw new Error(`${c.name}: prop name collision ${dupes.join(', ')}`)

  return {
    name,
    figmaName: c.name,
    figmaId: c.figmaId,
    figmaUrl: figmaUrl(c.figmaId),
    section: c.section,
    description: c.description,
    code: c.code ?? null,
    axes,
    axisDefaults: Object.fromEntries(Object.entries(axes).map(([k, v]) => [k, pickDefault(v)])),
    flags,
    interactionStates: [...new Set(interactionStates)],
    disabled: hasDisabled,
    booleans,
    texts,
    icons,
    slots
  }
}

export function loadContracts() {
  return loadSnapshot('components.json')
    .components.filter((c) => !FIGMA_ONLY.has(c.name))
    .map(toContract)
}
