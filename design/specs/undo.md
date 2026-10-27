# Undo

**Status:** decided by Neesh 2026-10-27 (audit decision F-010); not built yet. It is built as its own batch once the audit fixes land, because it touches files several fix batches own.
**Figma:** none yet. The changes needed are the Edit menu labels, the Trash card's "Tossed from…" caption, and the copy of the three permanent-action confirms (see "Design to update").

Neesh: "I want the undo to be contextual and powerful. If inside an input, undo that input. If it's not within a selection, undo EVERYTHING, including toast notifications & dangerous things that have been confirmed in the past. The only thing this doesn't cover is for example emptying the trash or something genuinely permanent, these actions should have a clear warning that this cannot be undone."

## The rule

⌘Z and Edit › Undo act on the innermost context. ⇧⌘Z and Edit › Redo act on the same one.

| Where the person is | ⌘Z undoes |
|---|---|
| A text field (title, description, a tag being typed, search) | Typing in that field. This is the browser's own field undo, unchanged. |
| An open Sort board or Look it over, focus outside a field | The flow's last step. Both flows already have their own steps. |
| Anywhere else | The app's last action this session, however long ago, whether or not its toast is still up. |

- **Redo:** a new action clears what's waiting to be redone, as in every Mac app.
- **The menu names it:** "Undo Move to Trash", "Redo Disband pile". In a field or a flow it reads plain "Undo". It's disabled when there's nothing to undo.
- **Toasts keep their Undo button.** It undoes that toast's action while it's still the newest in the history. Once something newer happens, the older toast's Undo button goes, and ⌘Z walks back in order.

## What's in the history

Every action a person takes that changes the library, including the ones that ask for a confirm today:

| Action | Today | Change |
|---|---|---|
| Move to Trash (mockup, pile, many) | Toast undo, 8 s | App history |
| Restore from Trash, Restore all | Re-trash undo | App history |
| Pile changes: New pile, merge, disband, remove from pile, put on top | `PileSnapshot` and `PILE_RESTORE`, toast | App history, with redo |
| Edit details: title, description, tags, category | `previous`, toast | App history, field-level |
| Star and unstar | None | App history |
| Cover: Replace, Use the PSD's preview | ⌘Z in the cover panel | App history |
| Pile base rename, variation set | Toast | App history |
| An import (a haul) | Cancel, then Undo all (`COPY_UNDO_ALL`) | App history: "Undo import of 12 mockups" (see Open points) |
| Sort's result (piles confirmed, mockups to To stash) | In-flow steps only | One app entry, "Undo Sort", when the board commits |
| Look it over: Stash & next, Stash pile | `StashSnapshot` | One app entry per stash. Its undo puts the mockups back in To stash with their drafts. |
| Toss (To sort, To stash) | Confirm, then a hard delete | **Becomes Move to Trash** (below), with no confirm |
| Delete a tag or category (Settings › Tags) | `TagSnapshot` and `CategorySnapshot`, toast | App history |
| Rename a tag or category | None | App history |
| Delete a model (Settings › AI model) | Confirm; `AI_RESTORE_MODEL` until relaunch | No confirm, app history (files kept until quit) |
| Stash check: Add, Ignore, and the all-at-once versions | `INTEGRITY_UNDO_ADD` and restore ignore, toast | App history |
| Move the stash folder | Waits for a restart, then clears the old folder | Undoable until the restart (it cancels the pending move). After the restart, move it back from Settings. |
| Discard your changes (Details sidebar) | Confirm | No confirm. Undo reopens the editor with the discarded values. |

**Not in the history:**
- **Settings switches:** usage data, the AI model choice, update checks, and the like. You flip them back.
- **The app's own work:** AI suggestions landing, pile titles being written, imports finishing, the stash check running. Only what the person did. Accepting a suggestion is a person's action.

## Permanent actions

Only three:
- **Empty Trash;**
- **Delete for good** (one Trash item);
- **Delete entry** (a Trash item whose PSD is gone).

Each keeps one ConfirmDialog with a red primary button and the line **"This can't be undone."** They're never in the history. Any history entries that point at what they deleted are dropped, so ⌘Z walks back past them to the action before.

Everything else that asks for a confirm today, and can now be undone, loses the confirm: Toss, Delete model and Discard changes. That follows the design rule that reversible actions are instant with Undo.

## Toss goes to Trash

- **Toss moves mockups to Trash,** and Trash marks where they came from. A Trash card reads "Tossed from To sort · 2 min ago".
- **Restore puts a tossed mockup back in the inbox it came from,** where today a restore always goes to My Stash.
- **Empty Trash is the only place the app's copies are deleted.** The person's own files are never touched, as now.
- **The data:** a trash row gains its origin (`my-stash`, `to-sort` or `to-stash`). `inbox-service.toss` calls the trash path in place of `deleteMockupsHard`.
- `inboxes.md` and the Trash section are updated to match.

## How it's built

- **A history in the main process.** Today, each undo is a closure held by its toast, and it vanishes when the toast does.
  - `UndoHistory` lives in main, in memory, for the session only. It's cleared on quit, and on a stash folder switch (which restarts anyway). It holds at most 200 entries.
  - An entry is data: `{ id, label, at, undo: Op, redo: Op }`. Each `Op` is a typed command with its payload, run through the same services the action used, so no closures.
  - Each undoable IPC handler records its entry with what it changed, before and after.
- **Channels,** all typed and zod-validated through the existing invoke, with no preload changes:
  - `undo:run` and `redo:run`;
  - `undo:context`: the renderer reports when a field or flow has focus, so the menu label is right;
  - a push of `{ undoLabel?, redoLabel? }` for toasts.
- **Field-level undo.** An entry restores only the fields its action changed, so undoing a title edit never wipes a description the AI wrote since. If the target is gone (deleted for good), the step is dropped with a short toast: "Couldn't undo Edit details: that mockup was deleted for good".
- **One route for ⌘Z.** The Edit menu's Undo and Redo become custom items with the ⌘Z and ⇧⌘Z accelerators. Both the key and a click send a menu command to the window. The renderer's router picks the context:
  - a focused field gets the field's own undo, through `webContents.undo()`;
  - an open flow gets the flow's own step;
  - otherwise it calls `undo:run`.

  The three handlers that compete today (the toast hotkey in `toastStore.ts`, Sort's `mod+z` and Look it over's) are folded into this router.
- **Redo needs the after-state.** Today's snapshots only go backwards. Each action in the table records enough to go both ways.

## Tests

- **`UndoHistory`, in main:** last in, first out; a new action clears redo; the 200-entry cap; a missing target is dropped; a permanent delete drops its entries.
- **Each action:** do, undo, redo, and the rows match the state after the first do, byte for byte.
- **The router:** a field, then a flow, then the app.
- **e2e:**
  - move a mockup to Trash, let the toast go, and Edit › Undo brings it back;
  - Toss, then ⌘Z after the toast has gone;
  - ⌘Z in a title field undoes typing only;
  - Empty Trash shows "This can't be undone" and leaves nothing to undo.

## Design to update

- **The Edit menu:** Undo and Redo labels that name the action.
- **The Trash card:** the "Tossed from To sort" caption, and Restore going back to the inbox the mockup came from.
- **The three permanent confirms:** the "This can't be undone." line, with a red primary.
- **Toss, Delete model and Discard changes:** their confirms are removed, and an Undo toast replaces each.

## Notes for building (from the audit fixes, 2026-10-27)

- **Route undo and redo first.** `runMenuCommand` drops every menu command while a dialog overlay other than Settings is open (`menu-commands.ts`). Sort and Look it over are dialogs, so undo and redo must be routed before that check.
- **The router mustn't rely on a global shortcut binding.** F-060 keeps those out of dialogs. With ⌘Z as a menu accelerator, the renderer receives a menu command, not a keydown, which fits.
- **Leave undo and redo out of F-008's replay** (`menu:pending`): a fresh window has nothing to undo.
- **"Undo Sort" restores the saved board too.** Since F-049, `GROUPING_CONFIRM` also removes the committed mockups from the saved board (`sortBoards.remove`), so the undo puts the board's remainder back, as well as the stage and the piles. "Sort N" commits only part of the board.
- **Undoing a stash in Look it over should return only the restored unit's items.** Today it reopens the whole queue (the left half of F-044).
- **Text fields:** `document.execCommand('undo')` in the renderer saves a round trip to `webContents.undo()`. Check it in the packaged app.

## Open points (for Neesh's review before building)

1. **Undoing an import.** "Undo import" moves what the haul brought in to Trash, which keeps redo possible, since the app doesn't keep the person's original paths. The alternative is deleting the copies outright, which is final, so there'd be no redo.
2. **A toast's Undo when it's no longer the newest.** The proposal hides it, so undo always goes in order. Undoing out of order would be possible for independent actions, but it's harder to reason about.
3. **What ⌘Z undoes inside Look it over.** Look it over has no step history today; its ⌘Z only brings back a dismissed edit offer (L7.10). The options:
   - its own steps: accepting or dismissing a suggestion or offer, and each Stash & next;
   - nothing of its own, so ⌘Z outside a field goes to the app history, whose newest entries are this session's stashes.

   The proposal is the first, since it keeps "the flow's last step" true in both flows.
