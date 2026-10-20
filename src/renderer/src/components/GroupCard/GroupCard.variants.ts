import { cva } from 'class-variance-authority'

// Figma GroupCard 220:3163: a proposed pile (header band + member grid) or the Standalone tray.
// The header is the pile's handle: click selects the pile, drag moves it whole.
export const groupCardVariants = cva('relative flex w-full flex-col rounded-xl @container/pile', {
  variants: {
    variant: { group: 'overflow-clip', standalone: 'gap-3 border border-base bg-surface-2 p-4' },
    state: {
      idle: '',
      'drag-over': '',
      'merge-target': '',
      'left-behind': '',
      selected: '',
      lifted: '',
      empty: ''
    }
  },
  compoundVariants: [
    { variant: 'group', state: 'idle', className: 'border border-base bg-surface-2' },
    { variant: 'group', state: 'selected', className: 'border-2 border-primary bg-surface-2' },
    {
      variant: 'group',
      state: 'lifted',
      className: 'border border-primary bg-surface-2 shadow-lifted'
    },
    {
      variant: 'group',
      state: 'left-behind',
      className: 'border border-dashed border-strong opacity-40'
    },
    { variant: 'group', state: 'drag-over', className: 'border-2 border-primary bg-primary-weak' },
    {
      variant: 'group',
      state: 'merge-target',
      className: 'border-2 border-primary bg-primary-weak'
    }
  ],
  defaultVariants: { variant: 'group', state: 'idle' }
})

export const groupCardHeaderVariants = cva(
  'flex items-center gap-2 border-b border-subtle py-1 pr-2 pl-4',
  {
    variants: {
      state: {
        idle: 'bg-surface-3',
        'drag-over': 'bg-primary-active',
        'merge-target': 'bg-primary-active',
        'left-behind': 'bg-surface-3 opacity-0',
        selected: 'bg-primary',
        lifted: 'bg-surface-3',
        empty: 'bg-surface-3'
      }
    },
    defaultVariants: { state: 'idle' }
  }
)

/** Columns follow the pile's own width: min tile 128, gap 12. */
export const GROUP_MEMBERS =
  'grid grid-cols-2 gap-3 p-3 @md/pile:grid-cols-3 @xl/pile:grid-cols-4 @3xl/pile:grid-cols-5 @4xl/pile:grid-cols-6 @5xl/pile:grid-cols-7 @6xl/pile:grid-cols-8'
