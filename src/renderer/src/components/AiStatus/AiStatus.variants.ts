import { cva } from 'class-variance-authority'

// Figma AiStatus 1075:201549: a 24px row, 8px gaps; the icon, a caption line that fills the row, then the
// actions. The kind only picks the icon (aiStatusIconVariants), so the row's class slots stay empty.
export const aiStatusVariants = cva('flex h-6 w-full items-center gap-2', {
  variants: {
    kind: {
      working: '',
      done: '',
      off: '',
      failed: '',
      none: ''
    }
  },
  defaultVariants: { kind: 'working' }
})

/** The icon's colour: the sparkle in text/primary, info in text/tertiary, the alert in text/warning. */
export const aiStatusIconVariants = cva('size-4 shrink-0', {
  variants: {
    kind: {
      done: 'text-foreground',
      off: 'text-tertiary',
      failed: 'text-warning'
    }
  }
})
