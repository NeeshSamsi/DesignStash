import { cva } from 'class-variance-authority'

export const modalVariants = cva('', {
  variants: {
    size: {
      sm: 'w-96',
      md: 'w-112',
      lg: 'w-160',
      xl: 'w-224'
    }
  },
  defaultVariants: { size: 'md' }
})
