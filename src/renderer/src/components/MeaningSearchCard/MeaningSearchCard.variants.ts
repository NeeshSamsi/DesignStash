import { cva } from 'class-variance-authority'

// Figma MeaningSearchCard 1000:6352: the AI panel's border and radius, one row of text beside the
// switch. Every state draws the same card; only the switch and the status line change.
export const meaningSearchCardVariants = cva(
  'flex w-full items-center gap-4 rounded-xl border border-base p-4',
  {
    variants: {
      state: {
        on: '',
        off: '',
        downloading: '',
        checking: '',
        ready: '',
        failed: ''
      }
    },
    defaultVariants: { state: 'on' }
  }
)
