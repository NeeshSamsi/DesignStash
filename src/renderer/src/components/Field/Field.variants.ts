import { cva } from 'class-variance-authority'

// Styles live in ui/field.tsx (shadcn, restyled from Figma); Field.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const fieldVariants = cva('', {
  variants: {
    orientation: {
      vertical: '',
      horizontal: ''
    },
    invalid: { true: '', false: '' }
  },
  defaultVariants: { orientation: 'vertical', invalid: false }
})
