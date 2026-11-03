import { cva } from 'class-variance-authority'

export const libraryToolbarVariants = cva('flex items-center justify-between gap-4', {
  variants: {
    filters: {
      none: '',
      active: ''
    }
  },
  defaultVariants: { filters: 'none' }
})
