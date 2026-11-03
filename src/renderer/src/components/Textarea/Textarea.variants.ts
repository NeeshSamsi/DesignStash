import { cva } from 'class-variance-authority'

// Styles live in ui/textarea.tsx (shadcn, restyled from Figma); Textarea.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const textareaVariants = cva('', {
  variants: {
    // 4 to 6 rows: at least four lines, then it grows to six and scrolls (the approval description).
    rowRange: { '3': '', '4-6': 'max-h-40 min-h-28 overflow-y-auto' }
  },
  defaultVariants: { rowRange: '3' }
})
