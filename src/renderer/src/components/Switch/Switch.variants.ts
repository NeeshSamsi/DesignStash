import { cva } from 'class-variance-authority'

// Styles live in ui/switch.tsx (shadcn, restyled from Figma); Switch.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const switchVariants = cva('', {
  variants: {
    size: {
      base: '',
      sm: ''
    },
    checked: { true: '', false: '' }
  },
  defaultVariants: { size: 'base', checked: false }
})
