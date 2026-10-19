import { cva } from 'class-variance-authority'

// Row styles live in ui/dropdown-menu.tsx (focus: = hover inside Radix). An in-place row has no
// Radix focus, so it gets the same fills on hover:.
export const dropdownMenuItemVariants = cva('', {
  variants: {
    variant: {
      neutral: 'hover:bg-surface-2-hover',
      destructive: 'hover:bg-error-weak'
    }
  },
  defaultVariants: { variant: 'neutral' }
})
