import { cva } from 'class-variance-authority'

// Panel, field, rows and status messages live in ui/command.tsx.
export const commandVariants = cva('', {
  variants: {
    variant: {
      inline: '',
      palette: ''
    },
    state: {
      results: '',
      empty: '',
      loading: ''
    }
  },
  defaultVariants: { variant: 'inline', state: 'results' }
})
