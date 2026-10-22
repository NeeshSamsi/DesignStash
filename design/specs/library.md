# Library (My Stash)

**Status:** designed 2026-10-12, built 2026-10-20. Its behaviour tests are real tests now (`src/renderer/src/components/MockupGrid/MockupGrid.behaviour.test.tsx`).
**Figma:** components MockupGrid, AddMockupCard, MockupCard, TagFilterPopover, CategoryPill, LibraryToolbar and Lightbox. The flows are in _↳ Library_ › _C · Library_: Browse (C1), Search (C2), Filter by tags (C3), Sort (C4), Card interactions (C5), Fullscreen preview (C6), Select (C7), Piles (C8) and Card menu & Trash (C9).

## Grid

- **Add card first:** `AddMockupCard` is the first card in **My Stash › All** (the inline-add rule from `tags.md`: add where the result appears). It's hidden in search results, while filtering and in Starred.
- **Empty library:** just the Add card, top-left. There's no centred empty page.
- **Add card actions:** click it (or press ↵ on it) to open the same Add menu as the sidebar button: Add files… and Add folder…. Dragging PSDs over the window shows `DropOverlay`, so the card has no drag state of its own.
- **Loading:** the Add card shows straight away (it isn't data), followed by 10 `MockupCard` loading cards in the same wrap and size, so nothing jumps when the real cards arrive. No spinner.
- **Other states:** no-results and error sit at the top under the toolbar, never vertically centred. The toolbar always shows, even at 0 items, so content starts at the same height on every screen.

## Empty states

- **No results:** the title repeats the query. There's one literal action: **Clear search**, **Clear filters**, or **Clear search and filters**, depending on what's active. It never says the library is empty.
- **Nothing starred yet:** explains how to star, with no button.
- **No secondary "Learn more":** there's no help site. `EmptyState` `secondary-action` is off by default.

## Search

- **Focus:** ⌘K or a click.
- **Results:** update as you type, after a 250ms debounce. The header says what was searched, and × clears the search and returns to All.
- **Keyword search:** words in the title, description and tags, plus hidden words: synonyms, and words from the file and folder names (`ai.md`). Filler words (on, in, with, the, a, and, of, for, at) are left out unless that is all there is.
- **Meaning search** (decided 2026-10-22, after the blind-search test): for a search of 3 or more characters, the closest mockup by meaning is added after the keyword results if it is close enough (cosine 0.55 or more) and keyword search did not find it. At most one is added. "jumper" finds a sweatshirt. A pile is one result, as for keywords: a pile member that is the closest match does not use the slot. Without the meaning model (not downloaded, deleted, or its server failed) search is keyword-only and nothing says so. Measured on 90 blind searches: found 48.4% to 65.6%, right 55.1% to 87.8%, recall never lower.

## Tag filter (TagFilterPopover)

```
Tags                     Clear all
[ Search 46 tags            ]
(All) (Device 5) (Style 4) (Scene 4) (Colour 3)
Device
☑ iPhone 24
☑ iPhone 15 Pro 12
...
```

- **Search:** filters the tags live. Categories with no matches disappear, and each pill shows how many tags match in it. There's no ⌘K hint inside the popover.
- **Pills:** `All` comes first and is active by default. Picking a category narrows the list to it.
- **The list:** scrolls once it's taller than about 240px.
- **Ticking a tag:** filters the grid immediately and adds a chip to the toolbar. Every picked tag must match (AND).
- **Two tiers, no nesting:** tags sit one level under their category. Roll-up is at the category level: filtering by a category includes all its tags (`LIBRARY_LIST` `categoryIds`; categories AND together, and with picked tags).
- **All in \<category\>** (decided 2026-10-20): the first row of each category group, with how many mockups have any of its tags. Ticking it filters by the whole category, including tags added later, and adds one “All in Device” chip to the toolbar. While it's ticked, that category's tag rows are disabled because the category already covers them, and ticking it clears any tags picked in that category. Unticking it, or × on its chip, restores the rows. The row is hidden while searching. Figma: `state=category-picked`.
- **No match:** shows “No tags match ‘x’”.
- **No tags yet:** the existing `empty` state, with Manage tags.

## Sort

- **Options:** **Date added**, newest first (the default), or **Name**, A to Z.
- **No favourites-first rule:** Starred has its own view, so favourites don't jump the queue in All.
- **The Add card:** stays first whatever the sort.

## Card interactions

These match Finder and the Sort board.

- **Click:** selects. Double-click or ↵ opens Detail, and Space opens the fullscreen preview.
- **Hover** (decided 2026-10-19): the star then ⋯ top-right. Along the cover's bottom, over a soft overlay scrim, a full-width primary **Open in Photoshop** with **Edit details** (ghost, no icon) under it. Edit details opens Detail, the same as double-click and ↵. Zoom isn't on the card; Space previews. A starred card keeps its filled star at rest. Exploration: Archive page, “Exploration · Library card hover & editing”.
- **Star:** fills the star and updates the count. Nothing moves.
- **Unstarring in Starred:** the star empties, but the card stays until you leave the view, with Undo.
- **Keyboard:** Tab into the grid, with the Add card as the first stop. Arrows move, ⇧+arrows extend the selection, ↵ opens, Space previews, and ⌫ moves to Trash.

## Select (same as Sort)

- **Click:** selects one card. **⌘-click** adds or removes a card. **⇧-click** selects the range in grid order.
- **Marquee:** drag from empty space to select every card the box touches, live. Hold ⌘ to add to the selection.
- **⌘A:** selects every mockup, not just the visible ones.
- **Clearing:** Esc or a click on empty space.
- **The Add card:** is never selectable. A marquee skips it, and clicking it opens the Add menu.
- **Selection ring:** the same `border/primary` ring as Sort tiles. The marquee is `background/selection` with a `border/primary` edge. The toolbar stats read “3 of 128 selected”.

## Piles

Groups are called piles everywhere, with Sort's verbs (New pile, Disband pile, Merge into, Put on top), so a pile looks and reads the same in Sort, Look it over and the Library.

- **Drop a card on a card:** the target shows “Start a pile”, and the card you drop onto goes on top. The dragged card leaves a dashed slot (`left-behind`).
- **Dragging a selection:** picks up a fanned stack with a count. Over a card, the target shows the pile size (“New pile from 4 mockups”).
- **⌘G** makes a pile from the selection, with the first selected card on top.
- **Drop onto a pile:** “Add to this pile”. **Pile onto a pile:** “Merge into this pile”. The target's top mockup stays on top.
- **Disband pile (⇧⌘G):** instant. The variants land as separate cards, all selected, so ⌘G piles them again. Toast: “Pile disbanded · 4 mockups are on their own”.
- **Undo:** every pile action shows a toast with Undo. **Esc** or dropping on empty space cancels a drag.

## Card menu & Trash

- **Opening it:** right-click and ⋯ open the same `DropdownMenu`. Right-click selects the card first. Right-clicking outside the selection switches to that card, like Finder.
- **One card:** Open in Photoshop · Edit details ↵ · Preview Space · Star · New pile (disabled, needs 2 or more) · Move to Trash ⌘⌫. The first two use the hover's words, so the menu and the card name the same actions the same way.
- **A selection:** New pile from 3 mockups ⌘G · Star 3 · Preview · Move 3 to Trash.
- **A pile:** Open in Photoshop (the top mockup) · Edit details · Preview · Star · Disband pile ⇧⌘G · Move pile to Trash.
- **Empty space:** Select all · Add files… · Add folder… · Undo (naming the last change).
- **Near the window edge:** menus open leftwards or upwards.
- **Move to Trash:** instant, with a toast and Undo, and no confirm dialog. ⌫ does the same for a selection. **Nothing skips Trash**; permanent deletion only happens there.
- **No Duplicate,** anywhere.

## Fullscreen preview (Lightbox)

- **Opening:** Space on a focused card, Preview in the card menu, Zoom in Detail, or Zoom in Look it over (L4.6).
- **Stepping:** ← → steps through the mockups in the grid's current order, respecting search, filter and sort. A pile steps through its variants.
- **Closing:** Esc closes it and returns focus to the card.
- **Loading:** a skeleton block the size of the cover, the same as every other loading cover (no spinner). If the file is missing, it offers Check library.
