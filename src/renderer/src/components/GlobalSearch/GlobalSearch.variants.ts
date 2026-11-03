import { cva } from 'class-variance-authority'

// Figma GlobalSearch 218:1649: 320 wide. The field itself is Input (search); idle / focused /
// with-query come from the field's own focus and value, so the slots stay empty.
// 320 is the preferred width; the field shrinks when the title bar is tight.
export const globalSearchVariants = cva('w-title-search max-w-full min-w-0', {
  variants: {
    state: {
      idle: '',
      focused: '',
      'with-query': ''
    }
  },
  defaultVariants: { state: 'idle' }
})
