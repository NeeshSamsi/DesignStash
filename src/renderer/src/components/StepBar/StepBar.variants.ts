import { cva } from 'class-variance-authority'

// Figma StepBar 1151:270293: five 12×4 steps, 2px apart. The value only decides how many are
// filled (stepBarStepVariants), so its class slots stay empty.
export const stepBarVariants = cva('flex items-start gap-0.5', {
  variants: {
    value: {
      '0': '',
      '1': '',
      '2': '',
      '3': '',
      '4': '',
      '5': ''
    }
  },
  defaultVariants: { value: '0' }
})

export const stepBarStepVariants = cva('h-1 w-3 rounded-xs', {
  variants: {
    filled: { true: 'bg-primary', false: 'bg-surface-3' }
  },
  defaultVariants: { filled: false }
})
