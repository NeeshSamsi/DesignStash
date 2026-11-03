import { cva } from 'class-variance-authority'

// Styles live in ui/checkbox.tsx (shadcn, restyled from Figma); Checkbox.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const checkboxVariants = cva('', {
  variants: {
    state: {
      unchecked: '',
      checked: '',
      indeterminate: ''
    }
  },
  defaultVariants: { state: 'unchecked' }
})
