import { cva } from 'class-variance-authority'

// Styles live in ui/kbd.tsx (shadcn, restyled from Figma); KeyboardShortcut.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const keyboardShortcutVariants = cva('', {
  variants: {
    variant: {
      boxed: '',
      plain: ''
    }
  },
  defaultVariants: { variant: 'boxed' }
})
