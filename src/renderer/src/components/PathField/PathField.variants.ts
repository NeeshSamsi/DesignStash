import { cva } from 'class-variance-authority'

// Figma PathField 223:3718: the stash location box. Border by state: input at rest, error when not writable, warning for an existing stash.
export const pathFieldVariants = cva('flex w-full flex-col gap-2', {
  variants: {
    state: { default: '', busy: '', 'not-writable': '', 'existing-library': '' }
  },
  defaultVariants: { state: 'default' }
})

export const pathFieldBoxVariants = cva(
  'flex items-center gap-3 overflow-clip rounded-lg border bg-surface-2 px-3 py-2.5',
  {
    variants: {
      state: {
        default: 'border-input',
        busy: 'border-input',
        'not-writable': 'border-error',
        'existing-library': 'border-warning'
      }
    },
    defaultVariants: { state: 'default' }
  }
)
