import { cva } from 'class-variance-authority'

// Figma PileRail 566:15524: a recessed well (surface-1) docked right of the form, 200px wide.
export const pileRailVariants = cva(
  'flex w-50 shrink-0 flex-col gap-1 rounded-xl border border-subtle bg-surface-1 p-3'
)
