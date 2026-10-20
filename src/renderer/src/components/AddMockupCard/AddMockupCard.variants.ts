import { cva } from 'class-variance-authority'

// Figma AddMockupCard 583:6960. A recessed well with a dashed cover, the same footprint as MockupCard.
// Hover lifts the well to surface-2 and turns the plus brand; focus is the 2px ring.
export const addMockupCardVariants = cva(
  'group/add flex w-full min-w-0 cursor-pointer flex-col items-stretch gap-2 rounded-card corner-squircle bg-surface-1 border border-subtle px-2.25 pt-2.25 pb-2.75 text-left transition-colors outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring'
)

export const addMockupCardCoverVariants = cva(
  'flex aspect-card items-center justify-center rounded-card-cover corner-squircle border border-dashed border-base transition-colors group-hover/add:border-strong'
)
