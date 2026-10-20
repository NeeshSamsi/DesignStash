import { cva } from 'class-variance-authority'

// Figma CoverImage 217:1121 (4:3). A plain rounded rectangle, radius steps with size; missing-file swaps the fill for a dashed error border.
export const coverImageVariants = cva(
  'relative flex shrink-0 flex-col items-center justify-center overflow-clip bg-surface-3',
  {
    variants: {
      size: {
        xs: 'h-7.5 w-10 rounded-md',
        sm: 'h-22.5 w-30 gap-2 rounded-lg',
        md: 'h-45 w-60 gap-2 rounded-xl',
        lg: 'h-90 w-120 gap-2 rounded-xl'
      },
      state: {
        loaded: '',
        loading: '',
        'no-preview': '',
        'missing-file': 'border border-dashed border-error bg-surface-2'
      }
    },
    defaultVariants: { size: 'md', state: 'loaded' }
  }
)

/** Icon box and device placeholder scale with the size. */
export const coverIconVariants = cva('shrink-0', {
  variants: {
    size: { xs: 'size-4', sm: 'size-4', md: 'size-5', lg: 'size-6' }
  },
  defaultVariants: { size: 'md' }
})

/** Stand-in for the image when `src` is empty: a device outline with a tinted screen. */
export const coverDeviceVariants = cva(
  'flex items-center justify-center rounded-lg border border-strong bg-surface-4',
  {
    variants: {
      size: {
        xs: 'h-3/4 w-1/4 rounded-xs p-px',
        sm: 'h-3/4 w-1/4 p-1',
        md: 'h-3/4 w-1/3 p-2',
        lg: 'h-3/4 w-1/3 p-2'
      }
    },
    defaultVariants: { size: 'md' }
  }
)
