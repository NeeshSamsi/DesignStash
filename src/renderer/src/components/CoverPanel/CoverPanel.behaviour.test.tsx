import { describe, it } from 'vitest'

// Pending behaviour spec for the cover panel — see design/specs/cover.md.
// Turn these into real tests when CoverPanel is ported.

describe('CoverPanel · cover image', () => {
  it.todo('shows the cover with a tag row: source tag, optional note, and an always-visible Zoom')
  it.todo('reveals Replace on hover, plus "Use the PSD’s preview" only when the cover is not the embedded preview')
  it.todo('opens the Lightbox from Zoom or Space')
  it.todo('opens the file picker from Replace and keeps the current cover until a new one is chosen')
  it.todo('shows the shared DropOverlay when an image is dragged over the cover')
  it.todo('rejects non-images while dragging, with the DropOverlay rejected state')
  it.todo('uses the first image when several files are dropped and says so')
  it.todo('accepts a pasted image (⌘V) like a drop')
  it.todo('keeps the old cover dimmed with progress while replacing; Esc cancels')
  it.todo('keeps the cover and shows an error Banner for unreadable files or files over 25 MB')
  it.todo('crops to 4:3 when at least 75% of the image survives, with the note "Cropped to 4:3"')
  it.todo('shows the whole image with bars when a crop would lose more than 25%')
  it.todo('offers the sidecar image via an info Banner and tags the cover "Sidecar image" once used')
  it.todo('requires a cover (Stash & next disabled) when there is no embedded preview or sidecar')
})
