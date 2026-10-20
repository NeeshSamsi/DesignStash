import { cva } from 'class-variance-authority'

export const lightboxVariants = cva('flex flex-col gap-4 bg-overlay p-6', {
  variants: {
    mode: {
      single: '',
      group: ''
    },
    state: {
      loaded: '',
      loading: '',
      missing: ''
    }
  },
  defaultVariants: { mode: 'single', state: 'loaded' }
})

/** The cover block in every state: 4:3, as wide as the stage allows. */
export const lightboxCoverClass = 'aspect-card h-auto max-h-full w-full max-w-240'
