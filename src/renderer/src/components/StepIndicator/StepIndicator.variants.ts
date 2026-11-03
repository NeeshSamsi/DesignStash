import { cva } from 'class-variance-authority'

// Figma StepIndicator 223:3556. Segments are 4 tall and share the width (224 in Figma, the parent's
// in code). Dots are 8 across, and the current one stretches to a 24 wide pill.
export const stepIndicatorVariants = cva('flex items-center', {
  variants: {
    variant: {
      segments: 'w-full gap-1.5',
      dots: 'gap-2'
    },
    step: {
      '1': '',
      '2': '',
      '3': '',
      '4': '',
      '5': ''
    }
  },
  defaultVariants: { variant: 'segments', step: '1' }
})

/** One mark. `complete` and `current` are primary; `upcoming` is surface-4. Done dots are half strength. */
export const stepIndicatorMarkVariants = cva('rounded-full', {
  variants: {
    variant: {
      segments: 'h-1 min-w-px flex-1',
      dots: 'h-2 shrink-0'
    },
    status: {
      complete: 'bg-primary',
      current: 'bg-primary',
      upcoming: 'bg-surface-4'
    }
  },
  compoundVariants: [
    { variant: 'dots', status: 'complete', className: 'w-2 opacity-50' },
    { variant: 'dots', status: 'current', className: 'w-6' },
    { variant: 'dots', status: 'upcoming', className: 'w-2' }
  ],
  defaultVariants: { variant: 'segments', status: 'upcoming' }
})
