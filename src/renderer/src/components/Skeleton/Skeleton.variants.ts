import { cva } from 'class-variance-authority'

// Sizes from Figma 211:118. `card` is MockupCard's 240 width (WP1.1's w-card token once it lands).
export const skeletonVariants = cva('', {
  variants: {
    variant: {
      block: 'h-24 w-40',
      line: 'flex flex-col gap-2',
      circle: 'size-10 rounded-full',
      card: 'flex w-card flex-col gap-2',
      row: 'flex items-center gap-3'
    }
  },
  defaultVariants: { variant: 'block' }
})
