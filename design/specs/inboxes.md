# Inboxes and Trash

**Status:** designed and approved 2026-10-19, built 2026-10-20.
**Figma:** MockupGrid, MockupCard (`pending-review` and `trash`), ActionBar, PageHeader, ConfirmDialog and Toast. The flows are on _↳ Inboxes & Trash_, one section each: _I1 · To sort_, _I2 · To stash_, _I3–I5 · Finish later, done & relaunch_ and _E · Trash_.

All three pages use the same grid, cards, action bar and selection as My Stash: click, ⌘-click, ⇧-click, marquee, ⌘A and Esc. The action bar's buttons act on the selection when there is one (“Look over 3”, “Toss 3”, “Restore 3”).

**Toss** (Toss these, Toss this haul, Toss 3) moves the cards to Trash at once, with no confirm: the toast reads “Tossed 3 mockups · They’re in Trash · Undo”, and ⌘Z undoes it however long ago (undo.md). Emptying Trash is the only place the app's copies are deleted.

## To sort

- **Cards:** file names only, singles (no +N yet).
- **AI status badge** (decided 2026-10-19): most cards will be ready, so only the few still in progress get a quiet badge, “Sniffing…”, matching Look it over's “Sniffing out a title…”. The action bar's line counts them (“Still sniffing 7 of 38”) and reads “AI suggestions ready for all 38” once they're done.
- **One Sort board** (Neesh, 2026-10-27): **Sort**, and **Sort now** on My Stash's waiting strip, open one board for everything waiting here, whichever drop it came in with, so piles can mix mockups from different drops. Finish later keeps that one board.
- **Sort 3:** with a selection, the board holds just those three, with the piles the whole board has cut to them. Look them over confirms only them and leaves the rest of the board as it was; Finish later puts them back into the whole board where they now sit.

## To stash

- **Cards:** piles with their +N and single mockups, in sorted order. No per-card status badge: everything on this page is waiting, and the page title says so.
- **Hover:** one full-width primary **Look it over** along the cover's bottom, over a soft scrim, styled like Open in Photoshop on My Stash cards. It opens that pile or mockup in Look it over, ahead of where Finish later left off, and carries on through the rest; after the last one it goes round to the first still waiting. Click still selects.
- **Action bar:** Toss these (secondary) · Look them over (primary). With a selection, “Look over 3” looks over just those three. Once they're stashed the toast says so and the page stays, since the rest still wait here.
- **Nothing left:** if everything Look it over would show was stashed or tossed meanwhile, it doesn't open: a toast says “Nothing left to look over” and the page refreshes.

## Done

- **All tucked away:** a success toast in the usual place, bottom-right, styled like “Saved your changes”: “All tucked away · 12 mockups stashed”. It times out like any toast. There's no separate celebration popup.
- **Some skipped:** Finish later after stashing some gives the same toast: “10 tucked away · 2 skipped ones are waiting in To stash.”

## Trash

- **Layout:** the same grid as My Stash, with no Add card. Cards show the cover (+N on piles), the title, and where each came from and when: “Trashed 2 days ago” from My Stash, “Tossed from To sort · 2 min ago” (or To stash) from an inbox, “From an undone import · 1 hour ago” for what an undone import brought in. Newest first. A pile comes back whole.
- **Hover:** Restore (primary, full width) with Delete for good under it, the same stack as Open in Photoshop and Edit details on My Stash cards. Right-click offers the same two.
- **Action bar:** Empty Trash (secondary) · Restore all (primary). Restore all needs no confirm: it's undoable from the toast. Restore puts each card back where it came from, and the toast says where (“Restored to To sort”), or plain “Restored” when they went back to different places. Empty Trash, Delete for good and Delete entry are the only permanent actions: each asks once, in red, with the line “This can’t be undone.”
- **Loading:** the action bar with both buttons disabled, then the grid's loading cards.
- **Delete for good:** a ConfirmDialog naming the item. There's no undo.
- **Restore failed:** the PSD is gone from the stash folder; the card says so, and the dialog offers Keep in Trash or Delete entry.
