import { cva } from 'class-variance-authority'

// Figma CopyWidget 373:5804: a 384 wide surface-3 card. Expanded and collapsed share the shell; the
// view only decides whether the file list and footer render. The state colours the lead icon.
export const copyWidgetVariants = cva(
  'flex w-96 flex-col items-start overflow-clip rounded-xl border border-base bg-surface-3',
  {
    variants: {
      view: {
        expanded: '',
        collapsed: ''
      },
      state: {
        copying: '',
        done: '',
        stopped: '',
        error: ''
      }
    },
    defaultVariants: { view: 'expanded', state: 'copying' }
  }
)

export const copyWidgetStatusVariants = cva('size-5', {
  variants: {
    state: {
      copying: 'text-muted-foreground',
      done: 'text-muted-foreground',
      stopped: 'text-warning',
      error: 'text-error'
    }
  },
  defaultVariants: { state: 'copying' }
})

/** The recessed file list. Only this part scrolls; the header and footer stay put. */
export const copyWidgetFilesVariants = cva(
  'flex max-h-62 w-full flex-col overflow-y-auto border-t border-base bg-surface-2 py-1',
  {
    variants: {
      footer: {
        true: 'border-b',
        false: ''
      }
    },
    defaultVariants: { footer: false }
  }
)

export const copyWidgetFadeVariants = cva(
  'pointer-events-none absolute inset-x-0 h-6 from-surface-2 to-transparent',
  {
    variants: {
      edge: {
        top: 'top-0 bg-gradient-to-b',
        bottom: 'bottom-0 bg-gradient-to-t'
      }
    },
    defaultVariants: { edge: 'top' }
  }
)
