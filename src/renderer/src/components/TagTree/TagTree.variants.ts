import { cva } from 'class-variance-authority'

// Figma 223:5509. The state axis only picks where the sample starts (catalog); the classes that
// matter are on the pieces below, which every state shares.
export const tagTreeVariants = cva('flex w-full flex-col gap-3', {
  variants: {
    state: {
      default: '',
      adding: '',
      added: '',
      duplicate: '',
      renaming: '',
      'new-category': '',
      empty: '',
      loading: ''
    }
  },
  defaultVariants: { state: 'default' }
})

/** A category: name, count and ⋯ over its tag rows, divided by hairlines. */
export const categoryClass =
  'flex flex-col divide-y divide-subtle overflow-clip rounded-xl border border-subtle bg-surface-1'

export const categoryHeaderClass = 'flex h-11 items-center gap-2 pr-2 pl-4'

export const tagRowClass = cva(
  'group/row relative flex h-10 items-center gap-2 pr-3 pl-4 outline-none hover:bg-surface-2 focus-within:bg-surface-2',
  {
    variants: {
      fresh: { true: 'border border-primary', false: '' },
      invalid: { true: '', false: '' }
    },
    defaultVariants: { fresh: false, invalid: false }
  }
)

/** The Add tag and New category rows. */
export const addRowClass =
  'flex h-10 w-full cursor-pointer items-center gap-2 pr-3 pl-4 type-body-sm-regular text-muted-foreground outline-none hover:bg-surface-2 hover:text-foreground focus-visible:bg-surface-2'

export const newCategoryRowClass = cva(
  'flex h-11 w-full items-center gap-2 rounded-xl pr-3 pl-4 type-body-sm-regular outline-none',
  {
    variants: {
      editing: {
        true: 'border-2 border-focus bg-surface-1',
        false:
          'cursor-pointer border border-dashed border-strong text-muted-foreground hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
      }
    },
    defaultVariants: { editing: false }
  }
)

/** The inline input that renaming and adding share (Figma "input": 28 high, focus ring 2px). */
export const rowInputClass = cva(
  'h-7 min-w-0 flex-1 rounded-md bg-surface-2 px-2 type-body-sm-regular text-foreground outline-none',
  {
    variants: {
      invalid: { true: 'border border-error', false: 'border-2 border-focus' }
    },
    defaultVariants: { invalid: false }
  }
)

export const rowHintClass = 'shrink-0 type-caption-xs-regular text-tertiary'
