import { cva } from 'class-variance-authority'

// The border is always there (transparent at rest) so selecting or flagging a row never shifts it.
export const listRowVariants = cva(
  'flex items-center gap-3 rounded-lg border border-transparent px-3 hover:bg-surface-1-hover',
  {
    variants: {
      density: {
        regular: 'py-2.5',
        compact: 'py-1.5'
      },
      state: {
        default: '',
        selected: 'border-selected bg-surface-3 hover:bg-surface-3',
        busy: '',
        error: 'border-error'
      }
    },
    defaultVariants: { density: 'regular', state: 'default' }
  }
)

export const listRowMediaVariants = cva(
  'flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-3 text-muted-foreground',
  {
    variants: {
      density: {
        regular: 'h-9 w-12',
        compact: 'h-6 w-8'
      }
    },
    defaultVariants: { density: 'regular' }
  }
)
