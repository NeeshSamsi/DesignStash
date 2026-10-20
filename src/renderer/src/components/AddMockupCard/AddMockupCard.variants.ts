import { cva } from 'class-variance-authority'

// Figma AddMockupCard 583:6960. A recessed well with a dashed cover, the same footprint as MockupCard.
// Hover lifts the well to surface-2 and turns the plus brand; focus is the 2px ring.
export const addMockupCardVariants = cva(
  'group/add flex w-card shrink-0 cursor-pointer flex-col items-stretch gap-2 rounded-2xl border border-subtle bg-surface-1 px-2 pt-2 pb-3 text-left transition-colors outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring'
)

export const addMockupCardCoverVariants = cva(
  'flex h-card-cover items-center justify-center rounded-xl border border-dashed border-base transition-colors group-hover/add:border-strong'
)
