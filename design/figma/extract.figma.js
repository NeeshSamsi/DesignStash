/* global figma */
// Figma → snapshot extractor. Run through the Figma MCP `use_figma` tool (Plugin API),
// read-only. Output is capped at ~20KB per call, so it runs in chunks:
//
//   const MODE = 'tokens'                    → variables + text styles
//   const MODE = 'components'; FROM/TO       → component-set contracts [FROM, TO)
//   const MODE = 'screens';    FROM/TO       → Flows-page screens [FROM, TO) + DS components used
//
// Claude merges the chunks into design/figma/{tokens,components,screens}.json, keeping the
// hand-curated fields (`code` hints, swap `kind`, screen `flow` names) from the current files.
// Then: pnpm ds (tokens + scaffold) and pnpm ds:check.

const MODE = 'components'
const FROM = 0
const TO = 30
const COMPONENTS_PAGE = '189:343'
const FLOWS_PAGE = '0:1'

const hex = (c) =>
  '#' +
  [c.r, c.g, c.b, ...(c.a !== undefined && c.a < 1 ? [c.a] : [])]
    .map((x) => Math.round(x * 255).toString(16).padStart(2, '0'))
    .join('')

if (MODE === 'tokens') {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const vars = await figma.variables.getLocalVariablesAsync()
  const byId = new Map(vars.map((v) => [v.id, v]))
  const out = {}
  for (const col of collections) {
    const mode = col.modes[0]
    out[col.name] = {
      mode: mode.name,
      variables: col.variableIds.map((id) => {
        const v = byId.get(id)
        const raw = v.valuesByMode[mode.modeId]
        const value =
          raw && raw.type === 'VARIABLE_ALIAS'
            ? { alias: byId.get(raw.id)?.name }
            : v.resolvedType === 'COLOR'
              ? hex(raw)
              : raw
        return { name: v.name, type: v.resolvedType, value, description: v.description }
      })
    }
  }
  const styles = (await figma.getLocalTextStylesAsync())
    .filter((s) => !s.name.startsWith('docs/'))
    .map((s) => ({
      name: s.name,
      family: s.fontName.family,
      style: s.fontName.style,
      size: s.fontSize,
      lineHeight: s.lineHeight.unit === 'PIXELS' ? s.lineHeight.value : null,
      letterSpacingPercent: s.letterSpacing.unit === 'PERCENT' ? s.letterSpacing.value : 0,
      textCase: s.textCase,
      description: s.description
    }))
  return { collections: out, textStyles: styles }
}

if (MODE === 'components') {
  const page = await figma.getNodeByIdAsync(COMPONENTS_PAGE)
  await page.loadAsync()
  const sets = page.findAllWithCriteria({ types: ['COMPONENT_SET'] }).slice(FROM, TO)
  const out = []
  for (const set of sets) {
    const variants = {}
    const booleans = {}
    const texts = {}
    const swaps = {}
    for (const [key, def] of Object.entries(set.componentPropertyDefinitions)) {
      const name = key.split('#')[0]
      if (def.type === 'VARIANT') variants[name] = def.variantOptions
      else if (def.type === 'BOOLEAN') booleans[name] = def.defaultValue
      else if (def.type === 'TEXT') texts[name] = def.defaultValue
      else if (def.type === 'INSTANCE_SWAP') {
        const target = await figma.getNodeByIdAsync(def.defaultValue)
        swaps[name] = { default: target?.name ?? def.defaultValue }
      }
    }
    const exposed = []
    for (const inst of set.defaultVariant.findAll((n) => n.type === 'INSTANCE' && n.isExposedInstance)) {
      const main = await inst.getMainComponentAsync()
      const owner = main?.parent?.type === 'COMPONENT_SET' ? main.parent.name : main?.name
      exposed.push(`${inst.name}:${owner}`)
    }
    let section = set.parent
    while (section && section.type !== 'SECTION' && section.parent?.type !== 'PAGE') section = section.parent
    out.push({
      name: set.name,
      figmaId: set.id,
      section: section?.name ?? null,
      description: set.description,
      variants,
      booleans,
      texts,
      swaps,
      exposed
    })
  }
  return { total: page.findAllWithCriteria({ types: ['COMPONENT_SET'] }).length, from: FROM, components: out }
}

if (MODE === 'screens') {
  const page = await figma.getNodeByIdAsync(FLOWS_PAGE)
  await page.loadAsync()
  const componentsPage = await figma.getNodeByIdAsync(COMPONENTS_PAGE)
  await componentsPage.loadAsync()
  const dsSets = new Set(componentsPage.findAllWithCriteria({ types: ['COMPONENT_SET'] }).map((s) => s.id))
  const frames = page.children.filter((n) => n.type === 'FRAME' || n.type === 'SECTION')
  const screens = page
    .findAll((n) => n.type === 'FRAME' && n.parent && (n.parent.type === 'SECTION' || n.parent.type === 'PAGE'))
    .slice(FROM, TO)
  const out = []
  for (const screen of screens) {
    const used = new Set()
    for (const inst of screen.findAllWithCriteria({ types: ['INSTANCE'] })) {
      const main = await inst.getMainComponentAsync()
      const set = main?.parent?.type === 'COMPONENT_SET' ? main.parent : main
      if (set && dsSets.has(set.id)) used.add(set.name)
    }
    out.push({ title: screen.name, figmaId: screen.id, group: screen.parent.name, components: [...used].sort() })
  }
  return { topLevel: frames.length, from: FROM, screens: out }
}
