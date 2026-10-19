import { cva } from 'class-variance-authority'

// Colours, padding and the live panel come from ui/dialog.tsx; this only sets the Figma widths.
export const dialogVariants = cva('', {
  variants: {
    variant: {
      dialog: 'w-112',
      'alert-dialog': 'w-96',
      sheet: 'h-160 w-96 rounded-none'
    }
  },
  defaultVariants: { variant: 'dialog' }
})
