import { cva } from 'class-variance-authority'

// Figma TitlePair 1160:26996: the base fills the row, an 8px gap either side of the dot, then the
// variation at a fixed width. The size only sets that width (titlePairVariationVariants).
export const titlePairVariants = cva('flex w-full items-center gap-2', {
  variants: {
    size: {
      default: '',
      compact: ''
    }
  },
  defaultVariants: { size: 'default' }
})

/** The variation: 180px, or 120px in narrow panels such as the details sidebar. */
export const titlePairVariationVariants = cva('shrink-0', {
  variants: {
    size: {
      default: 'w-45',
      compact: 'w-30'
    }
  },
  defaultVariants: { size: 'default' }
})
