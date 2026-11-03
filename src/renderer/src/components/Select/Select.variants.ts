import { cva } from 'class-variance-authority'

// Styles live in ui/select.tsx (shadcn, restyled from Figma); Select.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const selectVariants = cva('', {
  variants: {
    size: {
      base: '',
      sm: ''
    },
    open: { true: '', false: '' }
  },
  defaultVariants: { size: 'base', open: false }
})
