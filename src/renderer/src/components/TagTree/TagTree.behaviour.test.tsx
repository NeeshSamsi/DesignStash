import { describe, it } from 'vitest'

// Pending behaviour spec for Settings › Tags — see design/specs/settings.md (Tags).
// Turn these into real tests when TagTree is ported.

describe('TagTree · layout', () => {
  it.todo('renders one container per category with its name, tag count and ⋯ menu')
  it.todo('shows each tag row with its use count, such as "24 mockups"')
  it.todo(
    'ends every category with its own Add tag row and the list with a dashed New category row'
  )
  it.todo('has no nesting: no chevrons, indents or child rows')
})

describe('TagTree · adding a tag', () => {
  it.todo('turns the category Add tag row into an input row in place')
  it.todo('adds on Enter, keeps the input open and empty, and outlines the new row for about 2s')
  it.todo('closes the input on Esc or blur and drops typed text')
  it.todo('keeps the input and the typed text when adding fails')
})

describe('TagTree · a tag that exists elsewhere', () => {
  it.todo('turns the input red and says which category already has it')
  it.todo('offers "Move it to <this category>" and creates nothing twice')
  it.todo('moves the existing tag to this category from the button')
  it.todo('does nothing on Enter while the name is a duplicate')
})

describe('TagTree · tag menu', () => {
  it.todo('opens the ⋯ menu on hover or right-click with Rename, Move to, Merge into and Delete')
  it.todo('renames a tag inline: Enter saves, Esc cancels')
  it.todo('moves a tag to another category from Move to')
  it.todo('hands a merge to the owner with the tag to remove and the tag to keep')
  it.todo('deletes a tag at once with no confirm and reports it for Undo')
})

describe('TagTree · categories', () => {
  it.todo('renames a category from its ⋯ menu')
  it.todo('hands Delete category to the owner, which asks where the tags go')
  it.todo('turns the New category row into a header input: Enter adds, Esc cancels')
})

describe('TagTree · empty and loading', () => {
  it.todo('shows one line on where tags come from, and New category, when there are no tags')
  it.todo('shows skeleton containers while loading, never a spinner')
})
