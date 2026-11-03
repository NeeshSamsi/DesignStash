import { cva } from 'class-variance-authority'

// Panel, padding and widths (md 288, lg 384) live in ui/popover.tsx.
export const popoverVariants = cva('', {
  variants: {
    size: {
      md: '',
      lg: ''
    }
  },
  defaultVariants: { size: 'md' }
})
