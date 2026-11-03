import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@renderer/components/Button'
import { Badge } from '@renderer/components/Badge'
import { Input } from '@renderer/components/Input'
import { ScrollArea } from '@renderer/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import { CATALOG, type CatalogEntry } from './catalog.generated'
import type { ComponentContract } from './contract'
import { axisCombinations, stateColumns } from './matrix'
import { FIGMA_FLOWS_URL, HAPPY_PATH, SCREENS } from './screens.generated'
import { TOKENS } from './tokens.generated'

// DEV-only design-system catalog: the code-side mirror of the Figma Components page.
// Every component renders its full variant × state table from its contract, so porting
// a component from Figma is: fill <Name>.variants.ts + <Name>.tsx, compare here.

type Selection =
  | { kind: 'foundation'; id: 'colors' | 'primitives' | 'type' | 'scale' }
  | { kind: 'component'; name: string }
  | { kind: 'flow'; flow: string }

const FOUNDATIONS = [
  { id: 'colors', label: 'Colour tokens' },
  { id: 'primitives', label: 'Primitives' },
  { id: 'type', label: 'Text styles' },
  { id: 'scale', label: 'Spacing & radius' }
] as const

const STORAGE_KEY = 'ds-catalog:selection'
const loadSelection = (): Selection => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Selection
  } catch {
    /* ignore */
  }
  return { kind: 'foundation', id: 'colors' }
}

export default function DesignSystemCatalog({ onClose }: { onClose: () => void }) {
  const [selection, setSelectionState] = useState<Selection>(loadSelection)
  const [query, setQuery] = useState('')
  const setSelection = (next: Selection) => {
    setSelectionState(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    const groups = new Map<string, CatalogEntry[]>()
    for (const entry of CATALOG) {
      if (q && !entry.contract.name.toLowerCase().includes(q)) continue
      const list = groups.get(entry.contract.section) ?? []
      list.push(entry)
      groups.set(entry.contract.section, list)
    }
    return [...groups]
  }, [query])
  const flows = useMemo(() => [...new Set(SCREENS.map((s) => s.flow))], [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="font-heading text-sm font-semibold">Design system</span>
        <Badge variant="secondary">{CATALOG.length} components</Badge>
        <span className="text-xs text-muted-foreground">
          Generated from design/figma · pnpm ds to refresh
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
          Close
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-64 shrink-0 flex-col border-r border-border">
          <div className="p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter components…"
            />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 p-2 pt-0">
              <NavGroup title="Foundations">
                {FOUNDATIONS.map((f) => (
                  <NavItem
                    key={f.id}
                    active={selection.kind === 'foundation' && selection.id === f.id}
                    onClick={() => setSelection({ kind: 'foundation', id: f.id })}
                  >
                    {f.label}
                  </NavItem>
                ))}
              </NavGroup>
              {sections.map(([section, entries]) => (
                <NavGroup key={section} title={section}>
                  {entries.map((e) => (
                    <NavItem
                      key={e.contract.name}
                      active={selection.kind === 'component' && selection.name === e.contract.name}
                      onClick={() => setSelection({ kind: 'component', name: e.contract.name })}
                    >
                      {e.contract.name}
                    </NavItem>
                  ))}
                </NavGroup>
              ))}
              <NavGroup title="Screens">
                {flows.map((flow) => (
                  <NavItem
                    key={flow}
                    active={selection.kind === 'flow' && selection.flow === flow}
                    onClick={() => setSelection({ kind: 'flow', flow })}
                  >
                    {flow}
                  </NavItem>
                ))}
              </NavGroup>
            </div>
          </ScrollArea>
        </nav>
        <ScrollArea className="min-h-0 flex-1">
          <main className="flex flex-col gap-6 p-6">
            {selection.kind === 'foundation' && selection.id === 'colors' && <ColorTokens />}
            {selection.kind === 'foundation' && selection.id === 'primitives' && <Primitives />}
            {selection.kind === 'foundation' && selection.id === 'type' && <TextStyles />}
            {selection.kind === 'foundation' && selection.id === 'scale' && <Scale />}
            {selection.kind === 'component' && (
              <ComponentPage entry={CATALOG.find((e) => e.contract.name === selection.name)} />
            )}
            {selection.kind === 'flow' && (
              <FlowPage
                flow={selection.flow}
                onOpen={(name) => setSelection({ kind: 'component', name })}
              />
            )}
          </main>
        </ScrollArea>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- nav

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 pb-1 text-xs font-medium text-muted-foreground">{title}</span>
      {children}
    </div>
  )
}

function NavItem(props: {
  active: boolean
  onClick: () => void
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-accent',
        props.active && 'bg-accent font-medium'
      )}
    >
      <span className="truncate">{props.children}</span>
      {props.trailing}
    </button>
  )
}

function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-2xl font-semibold">{title}</h1>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- foundations

function Swatch({ cssVar, className }: { cssVar: string; className?: string }) {
  // Token values are data here, so the swatch colour comes from the CSS variable itself.
  return (
    <span
      className={cn('shrink-0 rounded-lg border border-border', className)}
      style={{ background: `var(${cssVar})` }}
    />
  )
}

function ColorTokens() {
  const groups = ['background', 'text', 'border'] as const
  return (
    <>
      <PageTitle title="Colour tokens">
        Semantic tokens from the Figma <code>design-tokens</code> collection, with the class to
        write for each. Figma names map straight across (background/surface-3 → bg-surface-3); the
        few names shadcn already owns use shadcn&apos;s utility instead (marked{' '}
        <Badge variant="outline">shadcn</Badge>).
      </PageTitle>
      {groups.map((group) => (
        <section key={group} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{group}</h2>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {TOKENS.colors
              .filter((t) => t.name.startsWith(group + '/'))
              .map((t) => (
                <div key={t.name} className="flex items-center gap-3 p-2">
                  <Swatch cssVar={t.cssVar} className="size-8" />
                  <div className="flex w-72 shrink-0 flex-col">
                    <span className="flex items-center gap-2">
                      <code className="text-sm">{t.utility}</code>
                      {t.via === 'shadcn' && <Badge variant="outline">shadcn</Badge>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.name} → {t.alias}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{t.description}</span>
                </div>
              ))}
          </div>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">shadcn variables</h2>
        <p className="text-xs text-muted-foreground">
          styles/shadcn-bridge.css points shadcn&apos;s variables at these tokens, re-theming every
          ui/ component (and any added later) without editing its classes. It is imported by
          assets/main.css.
        </p>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {TOKENS.shadcn.map((b) => (
            <div key={b.variable} className="flex items-center gap-3 px-3 py-1.5 text-sm">
              <code className="w-56 shrink-0">--{b.variable}</code>
              <Swatch cssVar={`--ds-${b.token.replace(/\//g, '-')}`} className="size-5" />
              <code className="text-muted-foreground">{b.token}</code>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function Primitives() {
  const ramps = new Map<string, (typeof TOKENS.primitives)[number][]>()
  for (const p of TOKENS.primitives) {
    const ramp = p.name.replace('color/', '').replace(/-[\d]+$|-alpha-\d+$/, '')
    ramps.set(ramp, [...(ramps.get(ramp) ?? []), p])
  }
  return (
    <>
      <PageTitle title="Primitives">
        Raw palette (Autumn Canopy). Components never use these directly.
      </PageTitle>
      <div className="flex flex-col gap-3">
        {[...ramps].map(([ramp, list]) => (
          <div key={ramp} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm">{ramp}</span>
            <div className="flex flex-wrap gap-1">
              {list.map((p) => (
                <div key={p.name} className="flex flex-col items-center gap-1" title={p.value}>
                  <Swatch cssVar={p.cssVar} className="size-10" />
                  <span className="text-xs text-muted-foreground">
                    {p.name.split('-').slice(1).join('-') || p.name.replace('color/', '')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// 140% when Figma sets the line height as a percentage, else its px value.
const lineHeightLabel = (s: { lineHeight: number | null; lineHeightPercent: number | null }) =>
  s.lineHeightPercent != null ? `${Math.round(s.lineHeightPercent)}%` : s.lineHeight

function TextStyles() {
  return (
    <>
      <PageTitle title="Text styles">
        Figma text styles → <code>type-*</code> utilities. Fonts follow the styles: change them in
        Figma, refresh the snapshot, run pnpm ds:tokens.
      </PageTitle>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {TOKENS.textStyles.map((s) => (
          <div key={s.name} className="flex items-baseline gap-4 p-3">
            <div className="flex w-64 shrink-0 flex-col">
              <code className="text-sm">{s.utility}</code>
              <span className="text-xs text-muted-foreground">
                {s.family} {s.style} · {s.size}/{lineHeightLabel(s)}
              </span>
            </div>
            <span className={s.utility}>Mockups, sorted and searchable</span>
          </div>
        ))}
      </div>
    </>
  )
}

function Scale() {
  const spacing = TOKENS.numbers.filter((n) => n.name.startsWith('spacing/'))
  const radius = TOKENS.numbers.filter(
    (n) => n.name.startsWith('radius/') && n.name !== 'radius/full'
  )
  return (
    <>
      <PageTitle title="Spacing & radius">
        Figma numbers match Tailwind&apos;s default scale (spacing-4 = 16px, rounded-lg = 8px); they
        also exist as --ds-* variables.
      </PageTitle>
      <section className="flex flex-col gap-1">
        {spacing.map((n) => (
          <div key={n.name} className="flex items-center gap-3">
            <code className="w-28 shrink-0 text-xs">{n.name}</code>
            <span className="w-12 shrink-0 text-xs text-muted-foreground">{n.value}px</span>
            <span className="h-2 rounded-sm bg-primary" style={{ width: `var(${n.cssVar})` }} />
          </div>
        ))}
      </section>
      <section className="flex flex-wrap gap-4">
        {radius.map((n) => (
          <div key={n.name} className="flex flex-col items-center gap-1">
            <span
              className="size-16 border border-border bg-muted"
              style={{ borderRadius: `var(${n.cssVar})` }}
            />
            <code className="text-xs">{n.name}</code>
          </div>
        ))}
      </section>
    </>
  )
}

// ---------------------------------------------------------------- components

function propRows(c: ComponentContract): [string, string, string][] {
  const rows: [string, string, string][] = []
  for (const [axis, options] of Object.entries(c.axes))
    rows.push([axis, options.map((o) => `'${o}'`).join(' | '), `'${c.axisDefaults[axis]}'`])
  for (const [flag, { on, off }] of Object.entries(c.flags))
    rows.push([flag, `boolean (state=${on} / ${off})`, 'false'])
  if (c.disabled) rows.push(['disabled', 'boolean', 'false'])
  for (const [b, def] of Object.entries(c.booleans)) rows.push([b, 'boolean', String(def)])
  for (const [t, def] of Object.entries(c.texts)) rows.push([t, 'string', `"${def}"`])
  for (const [i, def] of Object.entries(c.icons)) rows.push([i, 'IconSvgElement', def])
  for (const [s, nested] of Object.entries(c.slots))
    rows.push([s, 'ReactNode', nested === 'content' ? '—' : `(${nested})`])
  return rows
}

function ComponentPage({ entry }: { entry: CatalogEntry | undefined }) {
  if (!entry) return <PageTitle title="Not found" />
  const { contract: c, component: Component } = entry
  const columns = stateColumns(c)
  const rows = axisCombinations(c)
  const describe = (row: Record<string, string | boolean>) =>
    Object.values(row).join(' · ') || c.name

  return (
    <>
      <PageTitle title={c.name}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <a className="underline" href={c.figmaUrl} target="_blank" rel="noreferrer">
              Open in Figma
            </a>
            {c.figmaName !== c.name && <span>Figma: {c.figmaName}</span>}
            {c.code && <span>· Today: {c.code}</span>}
          </div>
          <p>{c.description}</p>
        </div>
      </PageTitle>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Props</h2>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
          {propRows(c).map(([name, type, def]) => (
            <div key={name} className="flex gap-4 px-3 py-1.5">
              <code className="w-40 shrink-0">{name}</code>
              <code className="flex-1 text-muted-foreground">{type}</code>
              <code className="w-40 shrink-0 truncate text-muted-foreground">{def}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Variants × states</h2>
        {c.interactionStates.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Figma also draws {c.interactionStates.join(', ')} — plain CSS (hover:, focus-visible:,
            active:); hover or tab through the cells below to check them.
          </p>
        )}
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <div key={describe(row)} className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">{describe(row)}</span>
              <div className="flex flex-wrap items-start gap-4">
                {columns.map((col) => (
                  <div key={col.label} className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{col.label}</span>
                    <Component {...row} {...col.props} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------- screens

function FlowPage({ flow, onOpen }: { flow: string; onOpen: (name: string) => void }) {
  const screens = SCREENS.filter((s) => s.flow === flow)
  return (
    <>
      <PageTitle title={flow}>
        Screens mocked on the Figma Flows page and the components each one composes.{' '}
        <a className="underline" href={FIGMA_FLOWS_URL} target="_blank" rel="noreferrer">
          Open Flows page
        </a>
      </PageTitle>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {screens.map((s) => {
          return (
            <div key={s.figmaId} className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{s.title}</span>
                {HAPPY_PATH.includes(s.figmaId) && <Badge variant="secondary">happy path</Badge>}
                <a
                  className="ml-auto text-xs underline"
                  href={FIGMA_FLOWS_URL.replace(
                    /node-id=.*/,
                    `node-id=${s.figmaId.replace(':', '-')}`
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  Figma
                </a>
              </div>
              <div className="flex flex-wrap gap-1">
                {s.components.map((n) => (
                  <button key={n} type="button" onClick={() => onOpen(n)}>
                    <Badge variant="outline">{n}</Badge>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
