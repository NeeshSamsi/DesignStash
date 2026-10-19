import { describe, it } from 'vitest'

// Pending behaviour spec for Detail & edit — see design/specs/detail.md.

describe('Detail & edit', () => {
  it.todo('opens from Edit details, a double-click or Enter, with a skeleton that mirrors the layout and a disabled footer')
  it.todo('shows an inline error with Retry and a plain, non-editable title when the entry cannot be read')
  it.todo('shows Save left of Open in Photoshop only once something changes, and saves with Cmd+S')
  it.todo('shows Save disabled with a reason when the title is emptied')
  it.todo('keeps edits and shows an error toast (no Retry; Save retries) when saving fails')
  it.todo('asks Keep editing or Discard when closing with unsaved changes')
  it.todo('moves to Trash instantly from the header trash icon or Cmd+Backspace, closes, and offers Undo')
  it.todo('disbands the pile instantly, closes, selects the mockups in the grid, and offers Undo')
  it.todo('offers no Duplicate and no permanent delete')
  it.todo('offers Try again or Cancel when Photoshop does not open')
})
