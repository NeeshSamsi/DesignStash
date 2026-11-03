import { cva } from 'class-variance-authority'

// Styles live in ui/separator.tsx (shadcn, restyled from Figma); Separator.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const separatorVariants = cva('', {
  variants: {
    orientation: {
      horizontal: '',
      vertical: ''
    }
  },
  defaultVariants: { orientation: 'horizontal' }
})
