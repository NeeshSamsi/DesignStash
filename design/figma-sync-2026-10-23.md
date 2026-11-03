# Figma sync, 2026-10-23: new fonts, break check, snapshot refresh

File `fB8PHTrzz89lAQOhXbsHMK`. Archive page untouched.

## The font switch (done by the orchestrator before this pass)

- Formiga became **Unbounded** (Regular, Medium, SemiBold) on the display, title and site display styles.
- Forma DJR Text became **Funnel Sans** (Regular, Medium, Bold) on body, caption, label and site text styles.
- docs/* and site/button stay Inter.
- Neesh then set every line height as a percentage in steps of 10 (body/sm 140%, caption and label 130%, title/lg 160%, display/2xl 130%, display/3xl 120%).

Figma rounds a percentage line box to whole pixels per line: body/sm 20, caption 16, title/lg 29 (was 28), display/2xl 31 (was 32). The browser keeps the fraction (19.6, 15.6, 28.8, 31.2), so Figma and the app can differ by up to a pixel per line.

## How the break check ran

A plugin scan over Components, every ↳ flow page and Marketing · Landing directions, on visible Unbounded and Funnel Sans text, looking for:
- text clipped sideways by a clipping ancestor;
- text or instances wider than their auto-layout parent's content box;
- short text (buttons, titles, labels, chips) that wraps;
- truncation, measured against the text's natural width;
- stale auto-width text (natural width against laid-out width) and stale heights after the line-height change;
- partial overlaps between free-positioned siblings;
- FILL children whose size no longer matches their parent (stale nested layout).

Flagged screens and a sample of busy ones were screenshotted before and after the fixes.

## Fixes

| Where | What changed | Why |
|---|---|---|
| SidebarNav (all four variants), every screen | Wordmark moved to a new style, **title/sm/semibold** (Unbounded SemiBold 14, 140%). Brand row padding 8 → 0 on both sides, so the logo sits flush left (Neesh's call) and the name ends 8 px short of the column edge. | At 18 px the name is 144 px in a 104 px slot and clipped to "DesignSto" on every app-window screen (317). 14 px keeps the type scale's existing size step and SemiBold keeps the wordmark's weight. Code mirror: `type-title-sm-semibold` on the name and no padding on the brand row (`SidebarNav.variants.ts`). |
| AddMenu (closed, open, disabled) | Trigger Button lg → base; component width 144 → 152, the full sidebar column. | "Add a mockup" with the lg padding needed 171 px and spilled 13 px past the button's content box. |
| EmptyState, page variant | Width 400 → 480 (384 px of text inside 48 px padding). Instances with their own width (MockupGrid no-results, C1.E3, I1.E3, I2.E2, E2) set to 480 and re-laid. | Page titles in Unbounded (319 to 380 px) wrapped in the 304 px column and left one-word lines ("Nothing waiting to be / sorted"). Code mirror: `max-w-100` → `max-w-120` in `EmptyState.variants.ts`. |
| CopyWidget (all variants) | Title truncation now allows two lines. | "Copying paused · a drive was un…" hid the reason. Code mirror: `truncate` → `line-clamp-2` on the headline in `CopyWidget.tsx`. |
| CoverPanel (drag-over variants) | The DropOverlay title inside the cover uses title/lg/semibold. Re-laid on L4.2 and L4.E3. | "Drop to use as cover" in display/2xl was clipped by the 270 px cover (D1.6, L4.2, L4.E3). Code mirror: `CoverPanel.tsx` needs a way to pass the smaller title style to `DropOverlay`. |
| C9.3 Right-click a selection | The context menu opens to the left of the pointer (x 1134 → 894). | The menu ran 94 px past the window's right edge and lost its shortcuts. macOS flips menus near the edge. |
| MockupCard compact hover, the Open button | Label "Open in Photoshop" → "Open". | It overflowed the 124 px hover row. This variant exists only in Figma (cards use a menu in code). |
| Two "more" icon buttons (compact cover hover, GroupMemberThumb hover) | Button size icon (36, resized to 28) → icon-xs (24). | The 20 px icon plus padding spilled out of the 28 px frame. Pre-existing; it now matches the xs button beside it. |
| SidebarNav Item, child sample variants | Width 112 → 128; sample label "Starred". | The component sample truncated its own label. Sidebar instances were never affected. |
| Two-line dialog titles (Existing library found, Restore failed, F2.2, F2.4, F4.6) | Re-laid. | They kept the old 28 px line box after the line-height change. |
| Text style descriptions | Dropped "Placeholder font: Inter, swap to Forma DJR Text / Formiga later" and the site styles' "Swap family to …" notes. | They described the old fonts. |

## Style changes (code mirrors these)

| Style | Before | After |
|---|---|---|
| **title/sm/semibold** (new) | none | Unbounded SemiBold, 14, line height 140%, letter-spacing 0 |
| **site/heading** | Unbounded SemiBold 54, 120%, letter-spacing 0 | letter-spacing **-2%** (size and line height unchanged) |

site/heading: Unbounded's wide set left one-word last lines in five landing headings ("Buried on your Mac, where only you can dig." went from 4 lines to 3). It now matches the negative tracking the hero styles already had. No other style changed.

## Checked and left as intended

- **Dialog titles that wrap to two lines** (F2.2, F2.4, F4.6, Existing library found, Restore failed). They are long questions in 336 to 400 px dialogs. F2.4 leaves "folder?" alone on the second line. That's a polish call for Neesh (shorter copy or a wider ConfirmDialog).
- **Toast messages that wrap** (Sort toasts, F3.9, F5.10, G1.E1). Toasts wrap by design.
- **PileStep labels** ("Variant · Clay iPhone…", 33 rows) and the L2.E3 MockupCard line ("Not checked · pre-filled fro…"). Both truncated before the switch too, and the meaningful start stays visible.
- **Body text that wraps** (ConsentPanel lists, HardwareSummary, Settings privacy line). Wrapping is intended.
- **GroupMemberThumb file names**: a fixed 20 px box on a 16 px line, unchanged by the switch.
- **⌘F hints on ↳ Gather** flagged as stale by width: re-laying them changed nothing, so they're a false positive (the ⌘ glyph measures differently in isolation).
- **Marketing**: the remaining one-word last lines in hero headlines ("It sorts / itself.", "Dig up any mockup you've stashed.") are typesetting choices for the site build (`text-wrap: balance`). The StashCard art spills its card by 2 px and a decorative image row sits under a fade; neither involves the fonts.
- **Components page doc table "Table · ModelCard"**: its old column labels overlap the row label. These are stale docs from an earlier layout and don't involve the fonts.
- **Half-pixel positions**: 50 to 170 text layers per page now sit on .5 px, because title/lg (29) and display/2xl (31) line boxes are odd and centre into even rows. No 10% step gives an even box at 18 or 24 px except display/2xl at 140% (34). The app renders the fractional line heights directly, so this only affects Figma rendering. Left for Neesh.

The final scan is clean apart from the intended items above.

## Snapshot refresh

- **tokens.json**: text styles now Unbounded and Funnel Sans with `lineHeightPercent` (extract from commit eaef7aa), plus the new title/sm/semibold. site/* styles are left out, like docs/*: they belong to the landing page. Colour and number variables are unchanged. Figma also holds layout/*, z-index/*, focus-ring/*, easing/*, radius/card* and panel/card motion variables that mirror hand-written values in `main.css`. They stay out of the snapshot as before. background/selection reads `#NaNNaNNaN` from the extractor (a colour with alpha), so its curated entry was kept.
- **components.json**: 86 sets.
  - New: MeaningSearchCard.
  - Left out: MeaningSearchLine (retired), which is shown only on the Archive board.
  - Contract changes: RadioGroup, KeyboardShortcut (⌘F), SidebarNav Item and ModelCard sample texts; ModelPicker `meaning` boolean and `model-3`; SettingsLayout's exposed model cards renamed to the new catalogue plus the meaning search row.
  - Curated descriptions updated where facts changed: Input and GlobalSearch (⌘F), ConsentPanel (switch), ModelPicker, ModelRow, ModelCard, CopyWidget, EmptyState, SidebarNav, AddMenu, DropOverlay.
  - The extractor reads exposed instances from the default variant only and doesn't see slots, so the curated `exposed` lists (slots, other variants) were kept. SidebarNav keeps `add:AddMenu`: Figma no longer nests AddMenu, but `SidebarNav.tsx` still renders `props.add`. Drop both together.
- **screens.json**: 347 screens.
  - The 16 new Settings screens (F3.8 to F3.13, F5.6 to F5.10, F6.1 to F6.4) and X5 macOS menu bar are added in page order.
  - Every screen's component list was re-extracted. Earlier lists were partial, because the extractor ran on pages whose nested instances weren't loaded. A throwaway `page.findAll()` after `loadAsync()` fixes it, so the lists now name every design-system component the screen uses, including the window behind a modal.
  - The two dialog-body components on ↳ Settings ("Modal body · release notes", "Modal body · report") are local components rather than sets on the Components page. The extractor doesn't list them.

`pnpm ds:check`: 23 problems. 17 are stale `.types.ts` and index files from the contract and description changes, plus `catalog.generated.ts` and `screens.generated.ts`. The other 5 are the missing scaffold for `components/MeaningSearchCard/` (the card lives in `screens/onboarding/MeaningSearchCard.tsx` today). `pnpm ds` was not run.
