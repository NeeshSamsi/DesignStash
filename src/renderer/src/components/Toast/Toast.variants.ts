import { cva } from 'class-variance-authority'

export const toastVariants = cva(
  'flex w-toast items-start gap-3 rounded-lg border border-base bg-surface-2 px-4 py-3',
  {
    variants: {
      variant: {
        neutral: '',
        success: '',
        info: '',
        error: ''
      }
    },
    defaultVariants: { variant: 'neutral' }
  }
)

export const toastIconVariants = cva('size-5 shrink-0', {
  variants: {
    variant: {
      neutral: 'text-muted-foreground',
      success: 'text-success',
      info: 'text-informational',
      error: 'text-error'
    }
  },
  defaultVariants: { variant: 'neutral' }
})
