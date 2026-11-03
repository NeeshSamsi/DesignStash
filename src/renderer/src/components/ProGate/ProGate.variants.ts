import { cva } from 'class-variance-authority'

// Figma ProGate 223:6940. Locked is a centred card: inline fits a panel (480 wide), page fills the
// content area. Unlocked has no chrome of its own; it only holds the feature.
export const proGateVariants = cva('flex flex-col items-center justify-center', {
  variants: {
    variant: {
      inline: 'w-120 max-w-full',
      page: 'w-264 max-w-full'
    },
    locked: {
      true: 'rounded-xl border border-subtle bg-surface-2 text-center',
      false: ''
    }
  },
  compoundVariants: [
    { variant: 'inline', locked: true, className: 'gap-3 p-6' },
    { variant: 'page', locked: true, className: 'gap-4 p-16' }
  ],
  defaultVariants: { variant: 'inline', locked: true }
})

export const proGateIconVariants = cva(
  'flex items-center justify-center rounded-xl bg-surface-3 text-brand',
  {
    variants: {
      variant: {
        inline: 'size-10 [&_svg]:size-5',
        page: 'size-14 [&_svg]:size-6'
      }
    },
    defaultVariants: { variant: 'inline' }
  }
)

export const proGateTitleVariants = cva('text-foreground', {
  variants: {
    variant: {
      inline: 'type-body-sm-medium',
      page: 'type-display-2xl-medium'
    }
  },
  defaultVariants: { variant: 'inline' }
})

export const proGateBodyVariants = cva('text-muted-foreground', {
  variants: {
    variant: {
      inline: 'type-caption-xs-regular',
      page: 'type-body-base-regular'
    }
  },
  defaultVariants: { variant: 'inline' }
})
