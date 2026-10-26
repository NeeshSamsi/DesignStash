import { cva } from 'class-variance-authority'

// Figma MockupCard 217:1492. The root fills its grid column (compact keeps 160px). The root is a plain wrapper: it holds the pile stack and the 12px the stack
// needs below it. The face (mockupCardFaceVariants) is the squircle container that scales on hover.
export const mockupCardVariants = cva('group/card relative flex min-w-0 flex-col outline-none', {
  variants: {
    variant: {
      library: 'w-full',
      'pending-review': 'w-full',
      compact: 'w-40',
      trash: 'w-full'
    },
    // Piles leave room for their two edges (6px a step).
    pile: { true: 'mb-3', false: '' }
  },
  defaultVariants: { variant: 'library', pile: false }
})

// Radius card (24) with 10px padding at the sides and top; hover scales the face with the card springs.
// Selected and group-target use the border/selected ring, inset so selecting never moves the grid. Focus
// is the shared focus-ring 2px outside the face; on the face's 24px radius its outer edge is radius/card-ring (28). Reduced motion keeps the fades and drops the scale.
export const mockupCardFaceVariants = cva(
  'relative z-10 flex flex-col gap-2 rounded-card corner-squircle bg-surface-2 px-2.5 pt-2.5 pb-3 transition-[color,background-color,scale,translate] duration-(--duration-card-out) ease-card-out group-hover/card:scale-104 group-hover/card:duration-(--duration-card-in) group-hover/card:ease-card-in group-focus-visible/card:focus-ring motion-reduce:transition-colors motion-reduce:group-hover/card:scale-100',
  {
    variants: {
      state: {
        default: '',
        selected: 'ring-2 ring-inset ring-selected',
        loading: '',
        'no-preview': '',
        'cover-missing': '',
        // The dashed slot a dragged card leaves behind; the content stays but is invisible.
        'left-behind': 'border border-dashed border-strong bg-transparent',
        'group-target': 'ring-2 ring-inset ring-selected'
      }
    },
    defaultVariants: { state: 'default' }
  }
)

/**
 * The pile's two card edges below the face (Figma D2.3 A2): 8px narrower each side and 6px lower per step.
 * Hover staggers them 50ms a layer (face, middle edge, back edge) and reverses on leave (back first).
 */
export const PILE_EDGE_BASE =
  'pointer-events-none absolute inset-y-0 rounded-card corner-squircle border border-base transition-[scale,translate] duration-(--duration-card-out) ease-card-out group-hover/card:duration-(--duration-card-in) group-hover/card:ease-card-in motion-reduce:transition-none motion-reduce:group-hover/card:scale-100 motion-reduce:group-hover/card:translate-y-1.5'
export const PILE_EDGE_FRONT =
  'inset-x-2 translate-y-1.5 bg-surface-3/80 delay-50 group-hover/card:scale-105 group-hover/card:translate-y-2'
export const PILE_EDGE_BACK =
  'inset-x-4 translate-y-3 bg-surface-3/45 delay-0 group-hover/card:scale-106 group-hover/card:translate-y-4 group-hover/card:delay-100'

/**
 * The cover well: 4:3 (220×165 in a 240 card), clipped to the cover radius. min-h-0 holds the ratio:
 * overflow-clip isn't a scroll container, so without it a portrait cover stretches the well to its own height.
 */
export const mockupCardCoverVariants = cva(
  'relative aspect-card min-h-0 w-full shrink-0 overflow-clip rounded-card-cover',
  {
    variants: { hidden: { true: 'opacity-0', false: '' } },
    defaultVariants: { hidden: false }
  }
)

/** Reveals hover-only controls on pointer hover or keyboard focus (not on mouse-click focus). */
export const REVEAL_ON_HOVER =
  'opacity-0 transition-opacity duration-(--duration-fast) group-hover/card:opacity-100 group-has-focus-visible/card:opacity-100'

/** Square 28px control on a cover (⋯, compact Open in Photoshop). */
export const OVERLAY_ICON_BUTTON =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-overlay text-foreground outline-none transition-colors hover:bg-surface-3 focus-visible:focus-ring [&_svg]:size-5'
