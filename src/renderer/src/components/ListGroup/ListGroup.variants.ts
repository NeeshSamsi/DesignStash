import { cva } from 'class-variance-authority'

export const listGroupVariants = cva('flex flex-col gap-1', {
  variants: {
    density: {
      regular: '',
      compact: ''
    },
    rows: {
      '3': '',
      '5': ''
    }
  },
  defaultVariants: { density: 'regular', rows: '3' }
})
