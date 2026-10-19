import { describe, it } from 'vitest'

// Pending behaviour spec for piles in Look it over — see design/specs/piles.md.

describe('Piles · drafts until Stash pile', () => {
  it.todo('starts a pile on its top mockup and pre-fills variants from it')
  it.todo('lists the pile in PileRail: top mockup, variants, then Review & stash pile')
  it.todo('lets any step be opened from the rail (everything is a draft)')
  it.todo('moves on with Next and jumps to the end with Review pile')
  it.todo('updates untouched variants when the top mockup is edited, keeping edited ones')
  it.todo('marks a mockup jumped past without opening and shows it as Not checked at review')
  it.todo('has no Skip for now inside a pile (Skip is only for mockups on their own)')
  it.todo('goes Back to the previous draft inside a pile')
  it.todo('goes Back from a pile’s top mockup into the previous pile’s review, marked stashed and editable')
  it.todo('goes Back from the very first mockup to Sort only while nothing is stashed')
  it.todo('shows the deck with the number of mockups not yet looked at, and none on the last one')
  it.todo('keeps the cover where it is on single-mockup screens')
  it.todo('shows Pile n of m in the header, then the haul count after the last pile')
  it.todo('reviews the pile as MockupCards and commits it all with Stash pile (N), undoable')
  it.todo('keeps all drafts and parks the pile in To stash on Finish later')
})
