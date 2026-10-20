import { cva } from 'class-variance-authority'

// Figma 217:1203. Solid = your tag, dashed = not a tag yet. The focus ring is the shared
// `ring-ring` (border/focus); the dashed chips keep their border so they don't jump on focus.
export const tagChipVariants = cva(
  'group/chip relative inline-flex max-w-full shrink-0 items-center gap-1 rounded-full px-2 py-0.5 type-caption-xs-regular whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring data-highlighted:ring-2 data-highlighted:ring-ring',
  {
    variants: {
      variant: {
        display: 'bg-surface-3',
        removable: 'bg-surface-3 hover:bg-surface-3-hover',
        filter: 'border border-primary bg-primary-weak',
        suggested:
          'cursor-pointer border border-dashed border-base hover:border-strong hover:bg-surface-3',
        new: 'border border-primary bg-surface-3 hover:bg-surface-3-hover',
        add: 'cursor-pointer border border-dashed border-strong hover:border-primary',
        input: 'min-w-tag-input border border-focus bg-surface-1'
      },
      state: {
        default: '',
        marked: '',
        thinking: '',
        typing: '',
        invalid: ''
      }
    },
    compoundVariants: [
      { variant: 'removable', state: 'marked', class: 'bg-error-weak hover:bg-error-weak' },
      {
        variant: 'suggested',
        state: 'thinking',
        class: 'cursor-default hover:border-base hover:bg-transparent'
      },
      { variant: 'input', state: 'invalid', class: 'border-error' }
    ],
    defaultVariants: { variant: 'display', state: 'default' }
  }
)
