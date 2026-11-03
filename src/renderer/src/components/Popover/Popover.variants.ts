import { cva } from 'class-variance-authority'

// Panel, border, shadow/raised and widths (md 288, lg 384) live in ui/popover.tsx; the regions in Popover.tsx.
export const popoverVariants = cva('', {
  variants: {
    size: {
      md: '',
      lg: ''
    },
    layout: {
      regions: '',
      // One padded column: header, content and footer stack with no dividers (the tag filter).
      'one-column': 'gap-3 p-4'
    }
  },
  defaultVariants: { size: 'md', layout: 'regions' }
})
