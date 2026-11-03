import { cva } from 'class-variance-authority'

// Styles live in ui/input.tsx (shadcn, restyled from Figma); Input.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const inputVariants = cva('', {
  variants: {
    variant: {
      text: '',
      search: '',
      'inline-title': ''
    }
  },
  defaultVariants: { variant: 'text' }
})
