import { cva } from 'class-variance-authority'

// Figma FlowModal 374:5650: 1352×822 (in a 1512×982 window), radius 2xl, a header of named steps and a padded body.
// 1352×822 is the preferred size; it shrinks to the window (max-*-viewport) and the body scrolls inside.
export const flowModalVariants = cva(
  'flex h-flow-modal w-flow-modal max-h-viewport max-w-viewport flex-col overflow-clip rounded-2xl border border-base bg-surface-2 text-foreground',
  {
    variants: { step: { sort: '', 'look-over': '' } },
    defaultVariants: { step: 'sort' }
  }
)

export const FLOW_HEADER = 'flex items-center gap-4 border-b border-subtle px-6 py-3'
export const FLOW_BODY = 'flex min-h-0 flex-1 flex-col px-8 pt-6 pb-8'
export const FLOW_TRACK = 'relative h-1 min-w-0 flex-1 overflow-clip rounded-full bg-surface-4'
