import { cva } from 'class-variance-authority'

// Panel, width and padding come from the Popover adapter; this styles what sits inside it.
export const tagFilterPopoverVariants = cva('gap-3', {
  variants: {
    state: {
      open: '',
      'some-selected': '',
      searching: '',
      'no-match': '',
      empty: ''
    }
  },
  defaultVariants: { state: 'open' }
})

/** The tag list scrolls once it is taller than `max-h-tag-filter` (~240px). */
export const tagFilterListClass = 'flex max-h-tag-filter flex-col gap-3 overflow-y-auto'
