import { describe, it } from 'vitest'

// Pending behaviour spec for Settings — see design/specs/settings.md.

describe('Settings · the modal', () => {
  it.todo('opens as an 880×760 modal over the page with My Stash, AI model, Tags, Privacy and About')
  it.todo('closes with Esc or the ✕ and leaves the page as it was')
})

describe('Settings · My Stash', () => {
  it.todo('shows the stash folder with its mockup count and size')
  it.todo('asks Move files, Point only or Cancel after Change… picks a folder')
  it.todo('shows move progress and then asks Restart now or Later')
  it.todo('says in plain words why a folder change did not happen')
  it.todo('shows the stash check as In sync, with when it ran and Check now')
  it.todo('shows what the check found as N to review, with Review…')
  it.todo('reads Couldn’t check with Check now when the check failed')
  it.todo('shows the Trash count and size with Open Trash, and asks once before Empty Trash…')
})

describe('Settings · AI model', () => {
  it.todo('shows this Mac and lists Your models, then Available to download')
  it.todo('collapses the models when on-device AI is switched off, and says titles come from file names')
  it.todo('downloads a model with progress, speed and time left, and cancels it')
  it.todo('says why a download stopped and offers Try again')
  it.todo('uses a downloaded model with one button, never the whole card')
  it.todo('asks before deleting the model in use, and says AI titles and tags stop')
  it.todo('deletes any other model at once with Undo')
})

describe('Settings · Tags', () => {
  it.todo('adds a tag to a category and a new category')
  it.todo('deletes a tag at once with Undo that restores it on every mockup')
  it.todo('asks before merging, with how many mockups move')
  it.todo('asks where a category’s tags go before deleting it, and deletes an empty one at once with Undo')
})

describe('Settings · Privacy', () => {
  it.todo('shares usage data only while its switch is on, and stops at once when it is turned off')
})

describe('Settings · About', () => {
  it.todo('shows the version and the update status, with Check for updates')
  it.todo('shows update progress with Cancel, and Restart now when it is ready')
  it.todo('shows the licences in a View modal')
  it.todo('copies the problem report')
})
