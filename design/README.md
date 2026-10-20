# Design system: Figma → code

Figma is the source of truth for tokens and component contracts
([DesignStash file](https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash): Components page `189:343`; screens on the `↳` flow pages, see below).
The code side is generated from a snapshot of that file, so porting a component comes down to styling its generated stub.

```
design/figma/                      snapshot of the Figma file (committed)
  tokens.json                      variables (primitives + design-tokens) and text styles
  components.json                  84 component-set contracts (variants, booleans, text, swaps, nested instances)
  screens.json                     267 flow-page screens (journey order) → the DS components each composes; prototype.start and happyPath are screen figmaIds
  extract.figma.js                 Plugin-API extractor used to refresh the snapshot
scripts/ds/
  contract.mjs                     Figma property → React prop rules (single source)
  build-tokens.mjs                 pnpm ds:tokens
  scaffold-components.mjs          pnpm ds:scaffold · pnpm ds:check
src/renderer/src/
  styles/tokens.css                --ds-* variables                               (generated, imported)
  styles/theme.css                 Tailwind colours for Figma names, type-* utils (generated, imported)
  styles/shadcn-bridge.css         shadcn variables → Figma tokens                (generated, imported)
  components/<Name>/               one folder per Figma component set
  design-system/                   contract types, ScaffoldStub, matrix, DEV catalog, drift test
```

## Commands

| Command            | What it does                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `pnpm ds`          | `ds:tokens` then `ds:scaffold`                                                                               |
| `pnpm ds:tokens`   | tokens.json → `styles/*.css` + `design-system/tokens.generated.ts`                                           |
| `pnpm ds:scaffold` | components.json/screens.json → component folders, barrel, catalog, screen map                                |
| `pnpm ds:check`    | Fails if anything generated is stale, a component is missing or orphaned, or a variants file lacks an option |

The DEV catalog is under 🐞 Debug → **Design system catalog**. It shows:

- every component's props and full variant × state table;
- colour/type/scale foundations;
- each flow's screens, with which components still block them.

It is left out of production builds.

## Tokens: how Figma meets Tailwind and shadcn

shadcn stays standard.

- **Components in `ui/`, including anything added later with `shadcn add`, keep using shadcn's own variables** (`--primary`, `--background`, `--muted-foreground`, `--border`…).
- `shadcn-bridge.css` (imported last by `assets/main.css`) points those variables at Figma tokens. That re-themes every shadcn component without editing its classes. `main.css` keeps shadcn's `@theme inline` mapping (`--color-primary: var(--primary)`…) but no colour values, radius multipliers or fonts of its own.
- **Dark only.** Figma defines one mode (Dark), so `:root` sets `color-scheme: dark` and `<html>` carries `.dark`. The bridge sets the same values for `:root` and `.dark`.
- **Figma tokens use their own names**, scoped the way Figma scopes them: `background/X` → `bg-X`, `text/X` → `text-X`, `border/X` → `border-X`. These are Tailwind's `--background-color-*` / `--text-color-*` / `--border-color-*` namespaces. Examples: `bg-surface-3`, `text-tertiary`, `border-focus`, `bg-error-weak`, `text-on-success`.
- **Five Figma tokens share a name shadcn already owns**, so code uses shadcn's utility for them:

  | Figma token          | Write                   |
  | -------------------- | ----------------------- |
  | `text/primary`       | `text-foreground`       |
  | `text/secondary`     | `text-muted-foreground` |
  | `background/primary` | `bg-primary`            |
  | `border/primary`     | `border-primary`        |
  | `border/input`       | `border-input`          |

  `build-tokens.mjs` refuses to emit a Figma key that would change a shadcn utility's meaning. The catalog's colour page lists the class for every token.

- **Motion, shadow, icon and focus tokens.** Durations (`--duration-fast` 120, `--duration-base` 200, `--duration-slow` 280) come from Figma `duration/*`; the easings (`--ease-out`, `--ease-in`) and the two shadows (`shadow-raised`, `shadow-lifted`, Figma effect styles) live in `main.css` `@theme`. Icons use `icon-sizes/*` (12, 14, 16, 20, 24) and `ICON_STROKE` from `design-system/icon.ts` (Figma `icon-stroke/default`, 1.5). Every ui/ control composes the `focus-ring` utility (2px ring, 2px offset) instead of its own ring classes. `--radius-card` aliases `--ds-radius-3xl`.

- **Type:** Figma text styles → `type-<role>-<size>-<weight>` (e.g. `type-body-sm-medium`). Fonts come from the text styles; the bridge points `--font-sans`/`--font-heading` at them. The font stack puts the bundled `'Inter Variable'` (`@fontsource-variable/inter`) before `'Inter'`.
- **Spacing, radius, border width, icon sizes** equal Tailwind's default scale (`p-4` = spacing/4 = 16px), so there are no new utilities. The bridge sets the exact Figma radii.
- **Layout sizes** that sit outside Tailwind's scale are named tokens in the `@theme` block of `assets/main.css` (approved list, decision D1). Each lives in the Tailwind namespace of the property it sets, so it produces only the utilities that make sense:

  | Utility | Size (Figma px) | Used for |
  | --- | --- | --- |
  | `w-sidebar` | 176 | App sidebar |
  | `w-title-search` | 320 | Title-bar search field |
  | `w-settings-modal` · `h-settings-modal` | 880 × 760 | Settings modal |
  | `w-flow-modal` · `h-flow-modal` | 1352 × 822 | FlowModal (Sort, Look it over, inboxes) |
  | `w-card` | 240 | MockupCard column (grid gaps are `gap-x-4 gap-y-6`) |
  | `w-detail-media` | 480 | Detail & edit media column |
  | `w-variant-slot` | 92 | VariantStrip slot |
  | `w-variant-thumb` · `h-variant-thumb` | 84 × 64 | VariantThumb |
  | `*-deck-peek` (spacing: `top-`, `translate-y-`…) | 12 | Cover deck peek offset |
  | `w-toast` | 360 | Toast |
  | `min-w-tag-input` | 120 | TagEditor inline input |
  | `max-w-tag-label` | 150 | Tag label truncation |
  | `max-h-tag-filter` | 240 | TagFilterPopover list, scrolls past this |
  | `max-h-modal-body` | 70vh | Legacy DetailModal body |
  | `aspect-card` | 4:3 | Cover images |

  A modal that can be wider than the window pairs its size with `max-w-full`/`max-h-full`. A new size needs approval first, then a token here.
- **No arbitrary values** (CLAUDE.md). If Figma needs a value that isn't a token, add it in Figma, refresh, regenerate; for a layout size, see above.

## Component contract rules (`scripts/ds/contract.mjs`)

| Figma                                     | React prop                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Variant axis (`variant`, `size`, `tone`…) | union prop; default `base`/`md` if present, else the first option                    |
| `state` = hover / focus / pressed         | **not a prop**: plain CSS (`hover:`, `focus-visible:`, `active:`)                    |
| `state` = disabled                        | `disabled?: boolean`                                                                 |
| `state` with two remaining options        | boolean named after the second (`default\|active` → `active`, `idle\|busy` → `busy`) |
| `state` with 3+ remaining options         | `state` union prop                                                                   |
| Boolean property                          | boolean prop (a clash with a slot/icon name becomes `show<Name>`)                    |
| Text property                             | string prop, Figma default                                                           |
| Instance swap of an icon                  | `IconSvgElement` prop (Hugeicons), Figma default                                     |
| Content swap / exposed nested instance    | `ReactNode` slot prop                                                                |
| `ContentSlot`, `ModalLayer`               | Figma-only helpers: a plain `ReactNode` / the Dialog overlay in code                 |

Per-component exceptions live in `OVERRIDES` (keep it tiny): `Switch` → `checked`, `FavouriteToggle` → `pressed`, Input/Textarea `empty|filled` derived from the value, Button/Input `icon` → `iconStart`.

## Files in a component folder

| File                 | Owner                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `<Name>.types.ts`    | **Generated every run.** `<NAME>_CONTRACT`, prop unions, `<Name>ContractProps`, `<NAME>_DEFAULTS` |
| `index.ts`           | Generated every run                                                                               |
| `<Name>.tsx`         | Created once, then yours. Renders `ScaffoldStub` until ported                                     |
| `<Name>.variants.ts` | Created once, then yours. `cva` with an empty class slot per option                               |
| `<Name>.test.tsx`    | Created once, then yours. Renders every variant × state; checks default text                      |

## Figma file layout

```
Inspiration & Exploration     explorations and references
Components                    every component set + tokens
———
Flows                         title page (empty)
↳ Start                       0 Launch · A Onboarding · A3 AI setup
↳ Gather                      B1
↳ Sort                        B2
↳ Look it over                B3
↳ Library                     C Library · D Detail & edit
↳ Inboxes & Trash             B4 Inboxes & exits · E Trash
↳ Settings                    F
↳ Integrity & errors          G Library integrity · X Cross-cutting
———
Archive                       retired and superseded screens
```

- **One page per journey stage, in the order people use the app.** Each page holds one section per flow (e.g. `0 · Launch`, `A · Onboarding`), straight on the canvas and never nested. Inside a section: rows of "Core flow" and "Edge cases" per sub-flow, each screen with its `Notes · …` card under it.
- **There's no Figma prototype.** The build is the prototype.
- **The extractor walks `FLOW_PAGES`** in `extract.figma.js`: page IDs in journey order, which also set the order of `screens.json`. When you add a `↳` page, add it there. The extractor fails if a `↳` page is missing from the list.

## Behaviour specs (`design/specs/`)

Figma shows how a component looks. When it also has rules that Figma can't hold (derived text, ordering, fallbacks), they're written up in `design/specs/<topic>.md`, and the component's Figma description links to the file. A spec with unbuilt rules also gets `it.todo` tests, so `pnpm test` lists them until they're built. Every spec below is built (2026-10-20) and has no pending tests left.

| Spec | Components | Behaviour tests |
| --- | --- | --- |
| [`pile-titles.md`](specs/pile-titles.md): how a pile on the Sort board is titled, and its count and reason badges | GroupCard | `src/shared/pile-title.test.ts` |
| [`tags.md`](specs/tags.md): the inline-add tags field. The add chip comes first and becomes the input, tags append at the end, and AI suggestions sit after a divider | TagEditor, TagChip (Look it over + Detail & edit) | `src/renderer/src/components/TagEditor/TagEditor.behaviour.test.tsx` |
| [`cover.md`](specs/cover.md): the cover panel. Tag row with Zoom; hover shows Replace and Use the PSD’s preview; drag uses the shared DropOverlay; crop or bars; 25 MB | CoverPanel, CoverDropZone, DropOverlay (Look it over + Detail & edit) | `src/renderer/src/components/CoverPanel/CoverPanel.behaviour.test.tsx` |
| [`piles.md`](specs/piles.md): a pile is drafts until Stash pile. Includes PileRail (recessed well, right of the form), the cover deck, the header badge and the review step | PileRail, PileStep, CoverPanel (deck), MockupCard | `src/renderer/src/components/PileRail/PileRail.behaviour.test.tsx` |
| [`library.md`](specs/library.md): the Add card first in the grid, loading and empty states, search, the tag filter, sort (date added by default), the card menu, selection, piles, Trash, and the fullscreen preview | MockupGrid, AddMockupCard, MockupCard, TagFilterPopover, CategoryPill, LibraryToolbar, DropdownMenu, Lightbox | `src/renderer/src/components/MockupGrid/MockupGrid.behaviour.test.tsx` |
| [`settings.md`](specs/settings.md): Settings as a modal with sections, grouped rows and switch accordions; the stash folder, stash check and Trash; ModelCard and downloads; editing tags in place | SettingsLayout, ModelCard, TagTree, HardwareSummary | `src/renderer/src/screens/settings/settings.behaviour.test.tsx` |
| [`inboxes.md`](specs/inboxes.md): To sort, To stash and Trash on the shared grid, the hover Look it over and Restore, the done toast, Restore all and Empty Trash | MockupGrid, MockupCard (pending-review, trash), ActionBar, Toast | `src/renderer/src/screens/inboxes/inboxes.behaviour.test.tsx` |
| [`detail.md`](specs/detail.md): opening and loading, explicit save, the unsaved-changes guard, instant Trash and Disband pile with Undo, no Duplicate, and no permanent delete | DetailModal layout, CoverPanel, MockupMetaForm, ErrorState, Toast | `src/renderer/src/components/DetailModalLayout/DetailModalLayout.behaviour.test.tsx` |

## Status (2026-10-20)

`pnpm ds:check` passes for all 84 components, and `pnpm ds:scaffold` prints 0 stubs. It also fails on a prototype screen id that is not in `screens.json`. Every flow in the Figma file is built. One component is ported but deliberately dormant: **ProGate** (decision D7: all features are unlocked in Phase 1, so no screen wraps anything in it yet). StatTile was retired (decision D5) and its stub removed.

The snapshot's `code` hints name the screen or component file that uses each component. A refresh from Figma rewrites them from the Figma descriptions, so re-apply them (or update the descriptions) when you refresh.

## Porting a component (when the design is approved)

0. **Read the component's spec** in `design/specs/` if one exists (the table above and the Figma description both point to it).
1. **Refresh the snapshot.** Ask Claude to "refresh the design snapshot": it runs `design/figma/extract.figma.js` through the Figma MCP in chunks and rewrites the JSON, keeping the hand-written `code` hints. Then run `pnpm ds && pnpm ds:check`. Contract changes surface as type errors and `ds:check` failures.
2. **Fill `<Name>.variants.ts`** from the Figma node linked in the file: token classes only.
3. **Replace the `ScaffoldStub` body in `<Name>.tsx`** with real markup. Keep `data-ds="<Name>"` on the root (tests and the catalog use it). Compose other DS components; don't restyle them.
4. **shadcn-backed primitives** (section 2: Button, Input, Badge, Select, Tabs, Dialog, Tooltip…): restyle the file in `ui/` in place. Keep shadcn's variant names there (`default`, `sm`…) so shadcn blocks keep working, and add any Figma-only variants alongside (e.g. Badge `success`/`warning`). `components/<Name>/<Name>.tsx` then becomes a thin adapter that maps Figma prop names onto the `ui/` component (e.g. `primary` → `default`, `base` → `default`). There is one implementation, and it has a Figma-shaped API.
5. **Check it in the catalog** against the Figma table, then `pnpm ds:scaffold` (it prints how many stubs remain).
6. **Screens:** once a flow's components are built, rebuild its screens from them, in the flow order from the port checklist. Delete the old piece when its last user goes.

## The port switch (done)

1. ✅ `assets/main.css` imports `../styles/shadcn-bridge.css` last; shadcn's colour values, `--radius-*` multipliers and the old `--color-brand-500` are gone.
2. ✅ App code that used shadcn `text-primary` as brand-coloured text is now `text-brand`. In Figma, `text/primary` is body text and is written `text-foreground`. Don't use `text-primary` for text.
3. Pending (with the Button port): restyle `ui/button.tsx`'s `destructive` variant to Figma's solid fill (`bg-error text-on-error`) if the design keeps it solid. The shadcn `--destructive` variable is mapped to the mid error tone because shadcn uses it for text, borders and tints.
