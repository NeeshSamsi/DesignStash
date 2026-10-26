import { cva } from 'class-variance-authority'

// Panel, border, shadow/raised and widths (md 288, lg 384) live in ui/popover.tsx; the regions in Popover.tsx.
export const popoverVariants = cva('', {
  variants: {
    size: {
      md: '',
      lg: ''
    }
  },
  defaultVariants: { size: 'md' }
})
