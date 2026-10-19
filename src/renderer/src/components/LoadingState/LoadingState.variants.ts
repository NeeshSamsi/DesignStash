import { cva } from 'class-variance-authority'

export const loadingStateVariants = cva('flex', {
  variants: {
    variant: {
      page: 'flex-col items-start gap-6',
      inline: 'items-center gap-2',
      'skeleton-grid': 'flex-wrap items-start gap-6',
      'skeleton-list': 'flex-col items-start gap-4'
    }
  },
  defaultVariants: { variant: 'page' }
})
