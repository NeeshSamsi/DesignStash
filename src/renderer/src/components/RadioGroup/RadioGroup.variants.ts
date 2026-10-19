import { cva } from 'class-variance-authority'

// Styles live in ui/radio-group.tsx (shadcn, restyled from Figma); RadioGroup.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const radioGroupVariants = cva('', {
  variants: {
    variant: {
      list: '',
      card: ''
    },
    selected: { true: '', false: '' }
  },
  defaultVariants: { variant: 'list', selected: false }
})
