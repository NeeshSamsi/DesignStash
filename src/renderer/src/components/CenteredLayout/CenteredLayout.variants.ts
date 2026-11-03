import { cva } from 'class-variance-authority'

// Figma CenteredLayout 216:1679: full window, no sidebar. The top 44px keeps the macOS traffic
// lights clear; the 560 stage is centred. card = surface-1 panel, bare = content straight on the window.
export const centeredLayoutVariants = cva(
  'flex h-full w-full flex-col overflow-hidden bg-surface-2',
  {
    variants: {
      variant: {
        card: '',
        bare: ''
      }
    },
    defaultVariants: { variant: 'card' }
  }
)

export const centeredLayoutContentVariants = cva(
  'flex w-140 max-w-full shrink-0 flex-col items-center gap-6',
  {
    variants: {
      variant: {
        card: 'rounded-2xl border border-subtle bg-surface-1 p-10',
        bare: ''
      }
    },
    defaultVariants: { variant: 'card' }
  }
)
