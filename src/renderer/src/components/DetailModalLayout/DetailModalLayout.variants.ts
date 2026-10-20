import { cva } from 'class-variance-authority'

// Figma DetailModal layout 222:4366: a 896px panel (Modal xl) of header, two-pane body and footer.
// The panel's own look (surface-2, border/base, radius xl, 24px padding) comes from the dialog it sits in.
export const detailModalLayoutVariants = cva('flex flex-col gap-5 w-224 sm:max-w-none', {
  variants: {
    variant: { single: '', group: '' },
    // Each state changes the content (skeleton, error, Save), not the panel.
    state: { loaded: '', dirty: '', saving: '', loading: '', error: '' }
  },
  defaultVariants: { variant: 'single', state: 'loaded' }
})

export const DETAIL_HEADER = 'flex items-center gap-2'
export const DETAIL_BODY = 'flex items-start gap-6'
/** The media column is 544 wide in Figma: the 480 cover, the deck's peek and room to breathe. */
export const DETAIL_MEDIA = 'flex w-136 shrink-0 flex-col gap-3'
export const DETAIL_META = 'flex min-w-0 flex-1 flex-col gap-3'
export const DETAIL_FOOTER = 'flex items-center justify-between gap-2'
