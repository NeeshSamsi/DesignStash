import { cva } from 'class-variance-authority'

// Figma DetailModal layout 222:4366: a 896px panel (Modal xl) of header, two-pane body and footer.
// The panel's own look (surface-2, border/base, radius xl, 24px padding) comes from the dialog it sits in.
export const detailModalLayoutVariants = cva(
  'flex max-h-viewport w-224 max-w-viewport flex-col gap-5',
  {
    variants: {
      variant: { single: '', group: '' },
      // Each state changes the content (skeleton, error, Save), not the panel.
      state: { loaded: '', dirty: '', saving: '', loading: '', error: '' }
    },
    defaultVariants: { variant: 'single', state: 'loaded' }
  }
)

export const DETAIL_HEADER = 'flex items-center gap-2'
/** The body scrolls when the window is short; the header and footer stay pinned. */
export const DETAIL_BODY = '-m-1 flex min-h-0 flex-1 items-start gap-6 overflow-y-auto p-1'
/** The media column is 544 wide in Figma: the 480 cover, the deck's peek and room to breathe. */
/** It may shrink on a narrow window, down to 20rem; the cover inside keeps its 4:3. */
export const DETAIL_MEDIA = 'flex w-136 min-w-80 shrink flex-col gap-3'
export const DETAIL_META = 'flex min-w-56 flex-1 flex-col gap-3'
export const DETAIL_FOOTER = 'flex items-center justify-between gap-2'
