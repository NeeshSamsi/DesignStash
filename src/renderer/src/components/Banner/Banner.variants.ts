import { cva } from 'class-variance-authority'

// Neutral card; tone colour lives only in the 3px left accent and the icon.
export const bannerVariants = cva(
  'flex items-center gap-3 rounded-lg border border-subtle border-l-3 bg-surface-2 py-3 pr-4 pl-4.5',
  {
    variants: {
      tone: {
        info: 'border-l-informational',
        warning: 'border-l-warning',
        error: 'border-l-error',
        success: 'border-l-success'
      }
    },
    defaultVariants: { tone: 'info' }
  }
)

export const bannerIconVariants = cva('size-5 shrink-0', {
  variants: {
    tone: {
      info: 'text-informational',
      warning: 'text-warning',
      error: 'text-error',
      success: 'text-success'
    }
  },
  defaultVariants: { tone: 'info' }
})
