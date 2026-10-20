import { describe, it } from 'vitest'

// Pending specs from design/specs/inboxes.md. Each becomes a real test as its page is built.

describe('inboxes: shared grid', () => {
  it.todo('selects like My Stash: click, ⌘-click, ⇧-click, marquee, ⌘A and Esc')
  it.todo('the action bar names the selection: "Look over 3", "Toss 3", "Restore 3"')
})

describe('To sort', () => {
  it.todo('cards are singles and show file names')
  it.todo('only cards still pending or sniffing get the "Sniffing…" badge')
  it.todo('the action bar reads "Still sniffing 7 of 38" from the ai:status push')
  it.todo('the action bar reads "AI suggestions ready for all 38" once nothing is left')
  it.todo('Sort opens the legacy grouping review')
})

describe('To stash', () => {
  it.todo('piles show +N and singles come in sorted order, with no per-card status badge')
  it.todo('hover shows a full-width "Look it over" that opens that card')
  it.todo('the action bar offers Toss these (secondary) and Look them over (primary)')
  it.todo('Toss these sends INBOX_TOSS with the ids')
  it.todo('Look them over opens the legacy approval stepper')
})

describe('done toasts', () => {
  it.todo('"All tucked away · 12 mockups stashed" when nothing was skipped')
  it.todo('"10 tucked away · 2 skipped ones are waiting in To stash." when some were skipped')
})

describe('Trash', () => {
  it.todo('has no Add card; cards show "Trashed 2 days ago", newest first')
  it.todo('hover shows Restore with Delete for good under it; right-click offers the same two')
  it.todo('Restore all needs no confirm and its toast offers Undo')
  it.todo('Empty Trash asks once, naming the count and the space it frees')
  it.todo('Delete for good is a confirm that names the item')
  it.todo('a restore with missing PSDs offers Keep in Trash or Delete entry')
  it.todo('while loading both action bar buttons are disabled and the grid shows loading cards')
})
