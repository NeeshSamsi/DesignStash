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

/** A picked tag: brand-weak pill, category then label, with a remove button. */
export const filterChipClass =
  'inline-flex items-center gap-1 rounded-full border border-primary bg-primary-weak px-2 py-0.5'
