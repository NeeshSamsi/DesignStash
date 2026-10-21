import { cva } from 'class-variance-authority'

export const sectionHeaderVariants = cva('flex items-center justify-between py-2', {
  variants: {
    variant: {
      static: '',
      sticky: 'sticky top-0 z-10 rounded-lg border border-subtle bg-surface-1 px-3'
    }
  },
  defaultVariants: { variant: 'static' }
})
