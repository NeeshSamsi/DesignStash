import { cva } from 'class-variance-authority'

// Figma GlobalSearch 218:1649: 320 wide. The field itself is Input (search); idle / focused /
// with-query come from the field's own focus and value, so the slots stay empty.
export const globalSearchVariants = cva('w-title-search', {
  variants: {
    state: {
      idle: '',
      focused: '',
      'with-query': ''
    }
  },
  defaultVariants: { state: 'idle' }
})
