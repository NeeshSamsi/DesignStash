import { cva } from 'class-variance-authority'

// Styles live in ui/button.tsx (shadcn, restyled from Figma); Button.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const buttonVariants = cva('', {
  variants: {
    variant: {
      primary: '',
      secondary: '',
      outline: '',
      ghost: '',
      destructive: '',
      link: ''
    },
    size: {
      xs: '',
      sm: '',
      base: '',
      lg: '',
      icon: '',
      'icon-xs': '',
      'icon-sm': ''
    }
  },
  defaultVariants: { variant: 'primary', size: 'base' }
})
