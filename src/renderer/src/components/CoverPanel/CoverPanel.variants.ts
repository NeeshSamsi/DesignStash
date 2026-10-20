import { cva } from 'class-variance-authority'

// Figma CoverPanel 220:3545. The media column is 480 wide; the cover is 4:3 inside it.
// Source changes the tag text and state the layers over the cover, so the panel's classes are shared.
export const coverPanelVariants = cva('relative isolate flex w-detail-media max-w-full flex-col gap-2', {
  variants: {
    source: { embedded: '', sidecar: '', uploaded: '', none: '' },
    // Each state changes what is drawn over the cover, not the panel's own classes.
    state: { default: '', 'drag-over': '', replacing: '', uploading: '', error: '' }
  },
  defaultVariants: { source: 'embedded', state: 'default' }
})

/** The cover well. It is a hover group, so Replace shows on pointer hover or keyboard focus. */
export const COVER_WELL =
  'group/cover relative aspect-card w-full overflow-clip rounded-xl bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-ring'

export const COVER_HOVER =
  'absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover/cover:opacity-100 group-has-focus-visible/cover:opacity-100'

/** A card of the pile deck behind the cover; it peeks out to the right. */
export const DECK_CARD =
  'absolute -z-10 w-full overflow-clip rounded-xl border border-base bg-surface-3'
