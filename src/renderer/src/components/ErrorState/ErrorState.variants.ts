import { cva } from 'class-variance-authority'

// `inline` is a Banner (see ErrorState.tsx); page and full-window are centred at the top of the view.
export const errorStateVariants = cva('flex flex-col items-center text-center', {
  variants: {
    variant: {
      inline: '',
      page: 'mx-auto w-full max-w-120 gap-4 p-12',
      'full-window': 'mx-auto w-full max-w-120 gap-4 p-16'
    }
  },
  defaultVariants: { variant: 'inline' }
})
