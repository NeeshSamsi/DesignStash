import { cva } from 'class-variance-authority'

// Figma ModelRow 223:4073 (picker). The chosen row is surface-3 with a selected (orange) border; the
// others sit back on surface-2 with the base border; a failed row keeps surface-3 with a red border.
export const modelRowVariants = cva('flex w-full items-start gap-3 rounded-lg border px-4 py-3', {
  variants: {
    state: {
      'not-installed': '',
      downloading: '',
      paused: '',
      verifying: '',
      failed: '',
      installed: ''
    },
    selected: {
      true: 'border-selected bg-surface-3',
      false: 'border-input bg-surface-2 hover:bg-surface-2-hover'
    }
  },
  compoundVariants: [{ state: 'failed', className: 'border-error bg-surface-3' }],
  defaultVariants: { state: 'not-installed', selected: true }
})

export const modelRowRadioVariants = cva(
  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
  {
    variants: {
      selected: {
        true: 'border-primary',
        false: 'border-strong bg-surface-2'
      }
    },
    defaultVariants: { selected: false }
  }
)
