import { cva } from 'class-variance-authority'

// Panel, padding and the Radix behaviour live in ui/alert-dialog.tsx; this sets the Figma width.
export const confirmDialogVariants = cva('w-96', {
  variants: {
    variant: {
      neutral: '',
      destructive: ''
    },
    working: { true: '', false: '' }
  },
  defaultVariants: { variant: 'neutral', working: false }
})
