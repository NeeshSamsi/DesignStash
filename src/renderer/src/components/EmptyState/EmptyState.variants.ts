import { cva } from 'class-variance-authority'

// Centred horizontally only: the state sits at the top of the view under the toolbar.
export const emptyStateVariants = cva('mx-auto flex w-full flex-col items-center text-center', {
  variants: {
    variant: {
      page: 'max-w-100 gap-4 p-12',
      inline: 'max-w-80 gap-3 p-6'
    }
  },
  defaultVariants: { variant: 'page' }
})

export const emptyStateTileVariants = cva(
  'flex shrink-0 items-center justify-center rounded-xl bg-surface-3 text-muted-foreground',
  {
    variants: {
      variant: {
        page: 'size-14 [&_svg]:size-6',
        inline: 'size-10 [&_svg]:size-5'
      }
    },
    defaultVariants: { variant: 'page' }
  }
)
