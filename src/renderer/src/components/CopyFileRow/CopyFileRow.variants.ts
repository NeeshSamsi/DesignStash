import { cva } from 'class-variance-authority'

// Figma CopyFileRow 372:5420: 48 tall row, 12 gutters, 32 tile · name + line · status. The state only
// changes the second line's colour (unreadable is red); the rest is content.
export const copyFileRowVariants = cva('flex h-12 w-full items-center gap-3 px-3 py-2', {
  variants: {
    state: {
      queued: '',
      copying: '',
      done: '',
      duplicate: '',
      unreadable: '',
      'not-psd': ''
    }
  },
  defaultVariants: { state: 'queued' }
})

export const copyFileRowDetailVariants = cva('w-full truncate type-caption-xs-regular', {
  variants: {
    state: {
      queued: 'text-tertiary',
      copying: 'text-tertiary',
      done: 'text-tertiary',
      duplicate: 'text-tertiary',
      unreadable: 'text-error',
      'not-psd': 'text-tertiary'
    }
  },
  defaultVariants: { state: 'queued' }
})
