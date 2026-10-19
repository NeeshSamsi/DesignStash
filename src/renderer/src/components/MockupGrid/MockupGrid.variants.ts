import { cva } from 'class-variance-authority'

// Figma MockupGrid 217:1902. Fills its container and wraps: 240px cards, 16 gap, 24 row gap.
// no-results and error sit at the top under the toolbar and are never vertically centred.
export const mockupGridVariants = cva('relative flex w-full flex-col', {
  variants: {
    state: {
      populated: '',
      loading: '',
      empty: '',
      'no-results': 'items-center',
      error: 'items-center'
    }
  },
  defaultVariants: { state: 'populated' }
})

export const MOCKUP_GRID_CARDS = 'flex flex-wrap content-start items-start gap-x-4 gap-y-6'

/** The drag box: background/selection with a border/primary edge. Positioned in client coordinates. */
export const MOCKUP_GRID_MARQUEE =
  'pointer-events-none fixed z-10 border border-primary bg-selection'
