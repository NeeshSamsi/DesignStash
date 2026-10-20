import { cva } from 'class-variance-authority'

// Figma HardwareSummary 223:3780. One card: icon tile, this Mac and what it can run, a status badge.
// Unsupported and low-disk warn with a border/warning outline.
export const hardwareSummaryVariants = cva(
  'flex w-full items-center gap-3 rounded-lg border bg-surface-2 px-4 py-3',
  {
    variants: {
      variant: {
        supported: 'border-subtle',
        unsupported: 'border-warning',
        'low-disk': 'border-warning'
      }
    },
    defaultVariants: { variant: 'supported' }
  }
)
