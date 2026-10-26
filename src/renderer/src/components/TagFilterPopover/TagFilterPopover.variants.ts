import { cva } from 'class-variance-authority'

// The panel and width come from ui/popover.tsx; its padding and spacing are its own.
export const tagFilterPopoverVariants = cva('gap-3 p-4', {
  variants: {
    state: {
      open: '',
      'some-selected': '',
      searching: '',
      'no-match': '',
      empty: '',
      'category-picked': ''
    }
  },
  defaultVariants: { state: 'open' }
})

/** The tag list scrolls once it is taller than `max-h-tag-filter` (~240px). */
export const tagFilterListClass = 'flex max-h-tag-filter flex-col gap-3 overflow-y-auto'
