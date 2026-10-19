import { cva } from 'class-variance-authority'

// Classes live in ui/tabs.tsx (Figma pill → shadcn default); this adapter adds nothing.
export const tabsVariants = cva('', {
  variants: {
    variant: {
      line: '',
      pill: ''
    }
  },
  defaultVariants: { variant: 'line' }
})
