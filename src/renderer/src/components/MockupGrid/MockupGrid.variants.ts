import { cva } from 'class-variance-authority'

// Figma MockupGrid 217:1902. Fills its container: a responsive grid of cards at least 220 wide, 16 gap, 24 row gap.
// no-results and error sit at the top under the toolbar and are never vertically centred.
export const mockupGridVariants = cva('relative flex min-h-0 w-full flex-1 flex-col', {
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

/** Columns come and go with the grid's own width; cards fill each column. Never scrolls sideways. */
export const MOCKUP_GRID_CARDS = 'grid-cards w-full min-w-0'

/** The drag box: background/selection with a border/primary edge. Positioned in client coordinates. */
export const MOCKUP_GRID_MARQUEE =
  'pointer-events-none fixed z-10 border border-primary bg-selection'
