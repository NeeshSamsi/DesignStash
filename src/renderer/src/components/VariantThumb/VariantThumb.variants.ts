import { cva } from 'class-variance-authority'

// Figma VariantThumb 751:7393. The cover sits in an 84×64 ring; `shown` uses the shared selected ring (border/primary, 2px).
// Hover is CSS (border/strong, name in text/secondary). The Figma ring radius is 10px, which has no token, so it is rounded-xl.
export const variantThumbVariants = cva(
  'box-border h-variant-thumb w-variant-thumb shrink-0 overflow-clip rounded-xl p-0.5 transition-colors',
  {
    variants: {
      state: {
        idle: 'border border-subtle group-hover/thumb:border-strong',
        shown: 'border-2 border-primary',
        'missing-cover': 'border border-subtle group-hover/thumb:border-strong'
      }
    },
    defaultVariants: { state: 'idle' }
  }
)

export const variantThumbLabelVariants = cva('min-w-0 flex-1 truncate type-label-xs-medium', {
  variants: {
    state: {
      idle: 'text-tertiary group-hover/thumb:text-secondary',
      shown: 'text-foreground',
      'missing-cover': 'text-tertiary group-hover/thumb:text-secondary'
    }
  },
  defaultVariants: { state: 'idle' }
})
