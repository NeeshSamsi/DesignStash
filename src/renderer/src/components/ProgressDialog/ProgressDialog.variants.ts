import { cva } from 'class-variance-authority'

export const progressDialogVariants = cva('w-96', {
  variants: {
    state: {
      running: '',
      cancelling: '',
      done: '',
      failed: ''
    }
  },
  defaultVariants: { state: 'running' }
})
