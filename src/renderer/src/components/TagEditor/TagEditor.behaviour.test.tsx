import { describe, it } from 'vitest'

// Pending behaviour spec for the inline-add tags field — see design/specs/tags.md.
// Turn these into real tests when TagEditor is ported.

describe('TagEditor · inline add', () => {
  it.todo('renders the add chip first, then your tags, then a divider and AI suggestions')
  it.todo('turns the add chip into the input in place on click or Enter')
  it.todo('shows matching tags grouped by category with use counts while typing')
  it.todo('appends an added tag at the end, marks it "new", and keeps the input open')
  it.todo('drops an AI suggestion once the same tag is added')
  it.todo('offers to create an unknown tag inline, with the categories in the same popover')
  it.todo('marks the input invalid and highlights the existing chip for a duplicate tag')
  it.todo('accepts a suggestion on click or ✓ and moves it to the end of your tags')
  it.todo('dismisses a suggestion for this mockup only')
  it.todo('removes a tag from its hover ×, undoable with ⌘Z')
  it.todo('marks the last tag on ⌫ in an empty input and removes it on a second ⌫')
  it.todo('adds every match from a pasted comma list and asks about new names one at a time')
  it.todo('closes back into the add chip on Esc or blur, dropping typed text')
  it.todo('shows the empty and AI-thinking states with the add chip still usable')
})
