/* global figma */
// Figma → snapshot extractor. Run through the Figma MCP `use_figma` tool (Plugin API),
// read-only. Output is capped at ~20KB per call, so it runs in chunks:
//
//   const MODE = 'tokens'                    → variables + text styles
//   const MODE = 'components'; FROM/TO       → component-set contracts [FROM, TO)
//   const MODE = 'screens';    FROM/TO       → screens on the ↳ flow pages [FROM, TO) + DS components used
//
// Flow pages sit between the "Flows" title page and the Archive divider, one per stage, in
// journey order. Each page holds one section per flow (not nested); screens and their
// "Notes · …" cards sit inside it.
//
// Claude merges the chunks into design/figma/{tokens,components,screens}.json, keeping the
// hand-curated fields (`code` hints, swap `kind`, screen `flow` names) from the current files.
// Then: pnpm ds (tokens + scaffold) and pnpm ds:check.

const MODE = 'components'
const FROM = 0
const TO = 30
const COMPONENTS_PAGE = '189:343'
// Flow pages in journey order. This order is the order of screens.json and the DEV catalog.
// IDs, not names, so renaming a page can't break the extract.
const FLOW_PAGES = [
  ['476:554', '↳ Start'],
  ['476:2214', '↳ Gather'],
  ['476:8322', '↳ Sort'],
  ['476:34703', '↳ Look it over'],
  ['476:42227', '↳ Library'],
  ['476:49755', '↳ Inboxes & Trash'],
  ['476:54461', '↳ Settings'],
  ['476:57911', '↳ Integrity & errors']
]

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
      // Text styles set line height as a percentage of the font size (in steps of 10).
      lineHeightPercent: s.lineHeight.unit === 'PERCENT' ? s.lineHeight.value : null,
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
  // Guard: a ↳ page missing from FLOW_PAGES would silently drop out of the snapshot.
  const listed = new Set(FLOW_PAGES.map(([id]) => id))
  const unlisted = figma.root.children.filter((p) => p.name.startsWith('↳') && !listed.has(p.id))
  if (unlisted.length)
    throw new Error(`Add these pages to FLOW_PAGES: ${unlisted.map((p) => `${p.id} ${p.name}`).join(', ')}`)
  const componentsPage = await figma.getNodeByIdAsync(COMPONENTS_PAGE)
  await componentsPage.loadAsync()
  const dsSets = new Set(componentsPage.findAllWithCriteria({ types: ['COMPONENT_SET'] }).map((s) => s.id))
  const all = []
  for (const [id, name] of FLOW_PAGES) {
    const page = await figma.getNodeByIdAsync(id)
    if (!page) throw new Error(`Flow page ${id} (${name}) is gone; update FLOW_PAGES`)
    await page.loadAsync()
    // One section per flow, straight on the page (never nested). Screens are the section's
    // frames; "Notes · …" cards sit under them.
    for (const section of page.children.filter((n) => n.type === 'SECTION').sort((a, b) => a.x - b.x)) {
      const frames = section.children
        .filter((n) => n.type === 'FRAME' && !n.name.startsWith('Notes · '))
        .sort((a, b) => a.y - b.y || a.x - b.x)
      for (const frame of frames) all.push({ frame, page: page.name, flow: section.name })
    }
  }
  const out = []
  for (const { frame, page, flow } of all.slice(FROM, TO)) {
    const used = new Set()
    for (const inst of frame.findAllWithCriteria({ types: ['INSTANCE'] })) {
      const main = await inst.getMainComponentAsync()
      const set = main?.parent?.type === 'COMPONENT_SET' ? main.parent : main
      if (set && dsSets.has(set.id)) used.add(set.name)
    }
    out.push({ title: frame.name, figmaId: frame.id, page, flow, components: [...used].sort() })
  }
  return { total: all.length, from: FROM, screens: out }
}
