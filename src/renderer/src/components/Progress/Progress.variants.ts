import { cva } from 'class-variance-authority'

// Track and indicator live in ui/progress.tsx; this is the label row + bar column.
export const progressVariants = cva('flex w-80 flex-col gap-1.5', {
  variants: {
    size: {
      sm: '',
      base: ''
    },
    state: {
      progress: '',
      complete: '',
      error: '',
      indeterminate: ''
    }
  },
  defaultVariants: { size: 'base', state: 'progress' }
})
