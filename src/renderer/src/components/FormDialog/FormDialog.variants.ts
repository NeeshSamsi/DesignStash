import { cva } from 'class-variance-authority'

export const formDialogVariants = cva('w-112', {
  variants: {
    state: {
      pristine: '',
      invalid: '',
      submitting: '',
      error: ''
    }
  },
  defaultVariants: { state: 'pristine' }
})
