# Detail & edit

**Status:** designed 2026-10-12, built 2026-10-20. Its behaviour tests are real tests now (`src/renderer/src/components/DetailModalLayout/DetailModalLayout.behaviour.test.tsx`).
**Figma:** DetailModal layout, CoverPanel, MockupMetaForm, VariantStrip, VariantThumb, ErrorState and Toast. The flows are in _↳ Library_ › _D · Detail & edit_: Open & view (D1), Edit & save (D2) and Actions (D3).

## Opening

- **From a card:** Edit details on hover or in the menu, double-click, or ↵. Detail is always editable; there's no read-only view (decided 2026-10-19, E1).
- **Loading:** the skeleton mirrors the loaded layout (a title bar, the cover with its tag row, the description box and tag chips), and the footer is disabled until the mockup has loaded.
- **Couldn't load it:** an inline `ErrorState`, styled like Banner (a neutral card with a left accent, no tinted fill), with Retry. The title shows as a plain heading, since there's nothing to edit. Close returns to the grid.

## Layout

- **Header:** the title field, Move to Trash (a trash icon, tooltip “Move to Trash ⌘⌫”), the star and close. The title is `Input` inline-title: the same border, fill and radius as the description box at rest, at title size, so everything that looks editable is editable (decided 2026-10-19, T1).
- **Left:** the cover (`CoverPanel`, the same as Look it over: Replace on hover and Zoom).
- **Right:** the description and tags (`TagEditor` inline add, the same as Look it over).
- **Footer** (decided 2026-10-19, F1): Disband pile bottom-left for a pile. Bottom-right, Open in Photoshop is always the primary button. Save (secondary) appears just left of it only once something changes; the footer is right-aligned, so Open in Photoshop never moves. The form shows no “Unsaved changes” badge: an enabled Save says it.
- **Removed:** Duplicate and Delete group (now pile).
- **A pile's variants:** **V1a**, decided 2026-10-19 and built into `VariantStrip` (overflow fits, start, scrolled, end; state missing-cover) and `VariantThumb` (idle, hover, shown, missing-cover). Screens: D1.3, D1.E2, D2.E3. The media column stays 480 wide, the same as a single mockup. The three exploration rounds are on the Archive page.
  - **Strip:** a row of thumbnails under the cover. Thumbnails sit on fixed slots every 92px, starting at the cover's left edge. Arrows, ← →, a trackpad or a drag always settle on a slot, so a thumbnail starts in the same place with or without scrolling or arrows.
  - **Arrows:** only on an end where there's more. No ‹ at the start and no › at the end. Once scrolled, each end with more gets a fade with the arrow on top, the same on both sides. 2 to 5 variants fit, with no arrows.
  - **Stepping:** ‹ › and ← → show the previous or next variant; the shown one stays in a clear slot, and stepping onto a faded end scrolls one slot. Clicking a thumbnail shows it.
  - **Top mockup:** marked with the simpler crown (Hugeicons crown-03, 10px, 1.25 stroke, `text/tertiary`). A status row under the strip names the shown variant (“back · 3 of 12”) and holds **Put on top**, or reads “Top” on the top mockup. Toast: “back is on top · Undo”.
  - **Deck:** the cover sits on the pile deck from Look it over (one card behind for a pile of 2, two for 3 or more), peeking 12px to the right. Switching variants moves the stack (D1.4, two playable frames in the D section: real speed and 4× slower; select one and press play): next, the top card slides 20px left and fades (140ms, ease-in) while the cards behind rise 6px (200ms, ease-out, from 40ms), about 240ms in all; previous is the reverse (200ms, ease-out). Jumps play one step, key presses never queue, the form crossfades in 120ms, and reduced motion is a 120ms crossfade.

## Editing

- **Saving:** explicit. Save appears once something changes, and ⌘S saves. A quiet success toast confirms, and the modal stays open.
- **Empty title:** Save shows but is disabled, with the tooltip “Add a title to save”.
- **Save fails:** the edits stay in the form and Save stays enabled. An error toast, in the same place and style as the success toast, says “Couldn’t save your changes · Your edits are still here. Try saving again.” (D2.E2). The Save button is the way to retry, so the toast has no Retry of its own, and nothing appears inside the form.
- **Closing with unsaved changes:** Esc or a click outside asks “Discard your changes?” (`ConfirmDialog`, destructive): Keep editing, or Discard as the red primary. There's no Save in the dialog; Keep editing returns to the form's Save. The code today discards silently.

## Actions

- **Move to Trash (⌘⌫):** closes Detail at once, and the toast offers Undo. There's no confirm dialog.
- **Disband pile (⇧⌘G):** closes Detail. The mockups land in the grid as separate cards, all selected, and Undo piles them again. There's no dialog.
- **Nothing skips Trash:** no “Delete for good” here.
- **No Duplicate.** The old modal's `MOCKUP_DUPLICATE` and its IPC channel are gone.
- **Photoshop didn't open:** offers Try again or Cancel, and nothing else.
