import { cva } from 'class-variance-authority'

// Figma 222:3346. Fields sit 20px apart; the variants only decide which fields show, so the
// class slots stay empty (approval: title, description, tags; detail: description, tags).
export const mockupMetaFormVariants = cva('flex w-full flex-col gap-5', {
  variants: {
    variant: {
      approval: '',
      detail: ''
    },
    state: {
      pristine: '',
      invalid: '',
      edited: '',
      saving: '',
      thinking: '',
      writing: ''
    }
  },
  defaultVariants: { variant: 'approval', state: 'pristine' }
})
