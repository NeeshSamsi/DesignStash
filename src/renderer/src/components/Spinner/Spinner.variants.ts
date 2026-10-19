import { cva } from 'class-variance-authority'

// Sizes and colour live in ui/spinner.tsx (shadcn-backed); this adapter adds nothing per size.
export const spinnerVariants = cva('', {
  variants: {
    size: {
      sm: '',
      base: '',
      lg: ''
    }
  },
  defaultVariants: { size: 'base' }
})
