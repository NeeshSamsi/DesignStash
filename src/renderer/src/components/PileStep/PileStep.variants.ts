import { cva } from 'class-variance-authority'

// Figma PileStep 566:15523: a 16px marker, a 12px label (and the note under it), and a connector
// from under the marker down to the next step's.
export const pileStepVariants = cva(
  'relative flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
  {
    variants: {
      status: {
        done: 'hover:bg-surface-2-hover',
        current: 'bg-surface-3',
        todo: 'hover:bg-surface-2-hover',
        skipped: 'hover:bg-surface-2-hover'
      }
    },
    defaultVariants: { status: 'done' }
  }
)

export const pileStepMarkerVariants = cva(
  'relative flex size-4 shrink-0 items-center justify-center rounded-full',
  {
    variants: {
      status: {
        done: 'bg-surface-4 text-foreground',
        current: 'border-2 border-primary bg-surface-1',
        todo: 'border-2 border-base bg-surface-1',
        skipped: 'border-2 border-dashed border-strong bg-surface-1'
      }
    },
    defaultVariants: { status: 'done' }
  }
)

export const pileStepLabelVariants = cva('truncate type-label-xs-medium', {
  variants: {
    status: {
      done: 'text-foreground',
      current: 'text-foreground',
      todo: 'text-muted-foreground',
      skipped: 'text-tertiary'
    }
  },
  defaultVariants: { status: 'done' }
})
