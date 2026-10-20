import { cva } from 'class-variance-authority'

export const categoryPillVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 type-label-xs-medium transition-colors outline-none focus-visible:focus-ring',
  {
    variants: {
      active: {
        true: 'bg-surface-4 text-foreground',
        false: 'bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground'
      }
    },
    defaultVariants: { active: false }
  }
)
