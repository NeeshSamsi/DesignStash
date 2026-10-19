import { describe, it } from 'vitest'

// Pending behaviour spec for the library grid — see design/specs/library.md.

describe('Library · grid, search, filter, sort', () => {
  it.todo('shows the Add card first in My Stash › All only (not in search, filter or Starred)')
  it.todo('shows just the Add card when the library is empty')
  it.todo('opens the Add menu from the Add card on click or Enter')
  it.todo('shows the Add card plus 10 skeleton cards in the real grid while loading')
  it.todo('keeps no-results and error states at the top under the toolbar')
  it.todo('offers Clear search, Clear filters or Clear search and filters depending on what is active')
  it.todo('filters the tag list live in the filter popover and updates category counts')
  it.todo('narrows the tag list to a category from its pill')
  it.todo('matches every picked tag (AND), with a parent tag including its children')
  it.todo('sorts by date added (newest first) by default, or by name')
  it.todo('keeps an unstarred card in Starred until the view is left, with Undo')
  it.todo('selects with click, Cmd-click, Shift-click range, marquee and Cmd+A; never the Add card')
  it.todo('opens Detail on double-click or Enter, not on a single click')
  it.todo('makes a pile by dropping a card or selection on a card (target goes on top) or with Cmd+G, undoable')
  it.todo('adds to or merges into a pile when dropped on one')
  it.todo('disbands a pile instantly with Shift+Cmd+G, leaving the mockups selected')
  it.todo('opens the same menu from right-click and the hover more button')
  it.todo('shows Open in Photoshop and Edit details along the cover on hover; Edit details opens Detail')
  it.todo('moves to Trash instantly with Undo from the menu, Cmd+Backspace or Backspace')
  it.todo('opens the fullscreen preview from Space or Preview in the card menu and steps with arrow keys in grid order')
  it.todo('returns focus to the card when the fullscreen preview closes')
})
