import { cva } from 'class-variance-authority'

// Figma ReconciliationPanel 223:6619: the body of the blocking stash-check modal. A 640 wide surface-2
// card, 24 padding, 16 between the heading, the two groups and the footer.
export const reconciliationPanelVariants = cva(
  'flex max-h-viewport w-160 max-w-full flex-col gap-4 rounded-xl border border-base bg-surface-2 p-6',
  {
    variants: {
      state: {
        scanning: '',
        drift: '',
        resolving: '',
        rescanning: '',
        'all-resolved': ''
      }
    },
    defaultVariants: { state: 'scanning' }
  }
)

// The Figma radius is 10px, which has no token, so it is rounded-xl (as in ModelCard).
export const reconciliationGroupVariants = cva(
  'flex w-full flex-col overflow-clip rounded-xl border border-subtle bg-surface-1'
)

export const reconciliationRowVariants = cva(
  'flex items-center gap-3 border-t border-subtle py-2.5 pr-3 pl-4'
)
