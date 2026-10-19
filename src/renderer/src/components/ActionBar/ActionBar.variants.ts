import { cva } from 'class-variance-authority'

export const actionBarVariants = cva('flex items-center gap-3', {
  variants: {
    variant: {
      modal: 'justify-between pt-4',
      stepper: 'justify-between pt-4',
      page: 'justify-end'
    }
  },
  defaultVariants: { variant: 'modal' }
})
