# Design system: Figma → code

Figma is the source of truth for tokens and component contracts
([DesignStash file](https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash): Components page `189:343`; screens on the `↳` flow pages, see below).
The code side is generated from a snapshot of that file, so porting a component comes down to styling its generated stub.

```
design/figma/                      snapshot of the Figma file (committed)
  tokens.json                      variables (primitives + design-tokens) and text styles
  components.json                  83 component-set contracts (variants, booleans, text, swaps, nested instances)
  screens.json                     189 flow-page screens (journey order) → the DS components each composes
  extract.figma.js                 Plugin-API extractor used to refresh the snapshot
scripts/ds/
  contract.mjs                     Figma property → React prop rules (single source)
  build-tokens.mjs                 pnpm ds:tokens
  scaffold-components.mjs          pnpm ds:scaffold · pnpm ds:check
src/renderer/src/
  styles/tokens.css                --ds-* variables                               (generated, imported)
  styles/theme.css                 Tailwind colours for Figma names, type-* utils (generated, imported)
  styles/shadcn-bridge.css         shadcn variables → Figma tokens                (generated, PORT SWITCH)
  components/<Name>/               one folder per Figma component set
  components/_legacy/              pre-design-system composites, deleted as screens are ported
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
- At the port, `shadcn-bridge.css` points those variables at Figma tokens. That re-themes every shadcn component without editing its classes.
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

- **Type:** Figma text styles → `type-<role>-<size>-<weight>` (e.g. `type-body-sm-medium`). Fonts come from the text styles; `--font-sans`/`--font-heading` switch with the bridge.
- **Spacing, radius, border width, icon sizes** equal Tailwind's default scale (`p-4` = spacing/4 = 16px), so there are no new utilities. The bridge sets the exact Figma radii.
- **No arbitrary values** (CLAUDE.md). If Figma needs a value that isn't a token, add it in Figma, refresh, regenerate.

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

Figma shows how a component looks. When it also has rules that Figma can't hold (derived text, ordering, fallbacks), they're written up in `design/specs/<topic>.md`, and the component's Figma description links to the file. Pending specs also have `it.todo` tests, so `pnpm test` lists them until they're built.

| Spec | Components | Pending tests |
| --- | --- | --- |
| [`pile-titles.md`](specs/pile-titles.md): how a pile on the Sort board is titled, and its count and reason badges | GroupCard | `src/shared/pile-title.test.ts` |
| [`tags.md`](specs/tags.md): the inline-add tags field. The add chip comes first and becomes the input, tags append at the end, and AI suggestions sit after a divider | TagEditor, TagChip (Look it over + Detail & edit) | `src/renderer/src/components/TagEditor/TagEditor.behaviour.test.tsx` |
| [`cover.md`](specs/cover.md): the cover panel. Tag row with Zoom; hover shows Replace and Use the PSD’s preview; drag uses the shared DropOverlay; crop or bars; 25 MB | CoverPanel, CoverDropZone, DropOverlay (Look it over + Detail & edit) | `src/renderer/src/components/CoverPanel/CoverPanel.behaviour.test.tsx` |
| [`piles.md`](specs/piles.md): a pile is drafts until Stash pile. Includes PileRail (recessed well, right of the form), the cover deck, the header badge and the review step | PileRail, PileStep, CoverPanel (deck), MockupCard | `src/renderer/src/components/PileRail/PileRail.behaviour.test.tsx` |
| [`library.md`](specs/library.md): the Add card first in the grid, loading and empty states, search, the tag filter, sort (date added by default), the card menu, selection, piles, Trash, and the fullscreen preview | MockupGrid, AddMockupCard, MockupCard, TagFilterPopover, CategoryPill, LibraryToolbar, DropdownMenu, Lightbox | `src/renderer/src/components/MockupGrid/MockupGrid.behaviour.test.tsx` |
| [`settings.md`](specs/settings.md): Settings as a modal with sections, grouped rows and switch accordions; the stash folder, stash check and Trash; ModelCard and downloads; editing tags in place | SettingsLayout, ModelCard, TagTree, HardwareSummary | none yet |
| [`inboxes.md`](specs/inboxes.md): To sort, To stash and Trash on the shared grid, the hover Look it over and Restore, the done toast, Restore all and Empty Trash | MockupGrid, MockupCard (pending-review, trash), ActionBar, Toast | none yet |
| [`detail.md`](specs/detail.md): opening and loading, explicit save, the unsaved-changes guard, instant Trash and Disband pile with Undo, no Duplicate, and no permanent delete | DetailModal layout, CoverPanel, MockupMetaForm, ErrorState, Toast | `src/renderer/src/components/DetailModalLayout/DetailModalLayout.behaviour.test.tsx` |

## Porting a component (when the design is approved)

0. **Read the component's spec** in `design/specs/` if one exists (the table above and the Figma description both point to it).
1. **Refresh the snapshot.** Ask Claude to "refresh the design snapshot": it runs `design/figma/extract.figma.js` through the Figma MCP in chunks and rewrites the JSON, keeping the hand-written `code` hints. Then run `pnpm ds && pnpm ds:check`. Contract changes surface as type errors and `ds:check` failures.
2. **Fill `<Name>.variants.ts`** from the Figma node linked in the file: token classes only.
3. **Replace the `ScaffoldStub` body in `<Name>.tsx`** with real markup. Keep `data-ds="<Name>"` on the root (tests and the catalog use it). Compose other DS components; don't restyle them.
4. **shadcn-backed primitives** (section 2: Button, Input, Badge, Select, Tabs, Dialog, Tooltip…): restyle the file in `ui/` in place. Keep shadcn's variant names there (`default`, `sm`…) so shadcn blocks keep working, and add any Figma-only variants alongside (e.g. Badge `success`/`warning`). `components/<Name>/<Name>.tsx` then becomes a thin adapter that maps Figma prop names onto the `ui/` component (e.g. `primary` → `default`, `base` → `default`). There is one implementation, and it has a Figma-shaped API.
5. **Check it in the catalog** against the Figma table, then `pnpm ds:scaffold`, which flips its status to _ported_.
6. **Screens:** once the catalog shows a flow's screens as _ready_, rebuild them from the components, in the flow order from the port checklist. Delete `_legacy/` pieces as their last user goes.

## The port switch (do once, at the start of the port)

1. In `assets/main.css`, import `../styles/shadcn-bridge.css` after the shadcn `:root`/`.dark` blocks, then delete those blocks' colour values and shadcn's `--radius-*` multipliers.
2. App code that used shadcn `text-primary` as brand-coloured text becomes `text-brand`. In Figma, `text/primary` is body text and is written `text-foreground`.
3. Restyle `ui/button.tsx`'s `destructive` variant to Figma's solid fill (`bg-error text-on-error`) if the design keeps it solid. The shadcn `--destructive` variable is mapped to the mid error tone because shadcn uses it for text, borders and tints.
