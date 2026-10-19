import { cva } from 'class-variance-authority'

// Figma ActivityDock 220:2499: a right-aligned stack, 12px apart, so toasts, the copy card and
// the DEV debug button never overlap. Pin it with className ("fixed right-4 bottom-4 z-50").
export const activityDockVariants = cva('flex flex-col items-end gap-3', {
  variants: {
    build: {
      production: '',
      dev: ''
    }
  },
  defaultVariants: { build: 'production' }
})
