import { cva } from 'class-variance-authority'

// Styles live in ui/badge.tsx (shadcn, restyled from Figma); Badge.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const badgeVariants = cva('', {
  variants: {
    variant: {
      primary: '',
      secondary: '',
      outline: '',
      destructive: '',
      success: '',
      warning: '',
      info: '',
      count: ''
    }
  },
  defaultVariants: { variant: 'primary' }
})
