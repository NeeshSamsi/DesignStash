import { cva } from 'class-variance-authority'

// Panel, field, rows and status messages live in ui/command.tsx.
export const commandVariants = cva('', {
  variants: {
    variant: {
      inline: '',
      palette: '',
      // No input, rule, fill, border or radius: the panel around it draws those.
      list: 'w-full rounded-none border-0 bg-transparent'
    },
    state: {
      results: '',
      empty: '',
      loading: ''
    }
  },
  defaultVariants: { variant: 'inline', state: 'results' }
})
