import { cva } from 'class-variance-authority'

// Figma MockupCard 217:1492. An iOS-squircle container (radius 2xl, surface-2) around a cover, meta lines and hover actions.
// Selected and group-target use the border/primary ring; hover and focus are plain CSS in MockupCard.tsx.
// Rings are inset so selecting never moves the grid (the Figma frame swaps a 2px border in at the same size).
export const mockupCardVariants = cva(
  'group/card relative flex flex-col gap-2 rounded-2xl bg-surface-2 px-2 pt-2 pb-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
  {
    variants: {
      variant: {
        library: 'w-card',
        'pending-review': 'w-card',
        compact: 'w-40',
        trash: 'w-card'
      },
      state: {
        default: '',
        selected: 'ring-2 ring-inset ring-primary',
        loading: '',
        'no-preview': '',
        'cover-missing': '',
        // The dashed slot a dragged card leaves behind; the content stays but is invisible.
        'left-behind': 'border border-dashed border-strong bg-transparent',
        'group-target': 'ring-2 ring-inset ring-primary'
      }
    },
    defaultVariants: { variant: 'library', state: 'default' }
  }
)

/** The cover well: 168px tall (108px in compact), clipped to radius xl. */
export const mockupCardCoverVariants = cva('relative w-full shrink-0 overflow-clip rounded-xl', {
  variants: {
    variant: {
      library: 'h-card-cover',
      'pending-review': 'h-card-cover',
      compact: 'h-card-cover-compact',
      trash: 'h-card-cover'
    },
    hidden: { true: 'opacity-0', false: '' }
  },
  defaultVariants: { variant: 'library', hidden: false }
})

/** Reveals hover-only controls on pointer hover or keyboard focus (not on mouse-click focus). */
export const REVEAL_ON_HOVER =
  'opacity-0 group-hover/card:opacity-100 group-has-focus-visible/card:opacity-100'

/** Square 28px control on a cover (⋯, compact Open and Preview). */
export const OVERLAY_ICON_BUTTON =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-overlay text-foreground outline-none transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5'
