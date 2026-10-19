import { cva } from 'class-variance-authority'

// Figma SidebarNav 218:1964: w-sidebar, surface-2, 16px padding (none on top, the title bar owns it).
// `variant` says which of To sort / To stash are listed; the rows come from the props.
export const sidebarNavVariants = cva(
  'flex h-full w-sidebar flex-col gap-4 bg-surface-2 px-4 pb-4',
  {
    variants: {
      variant: {
        none: '',
        'to-sort': '',
        'to-stash': '',
        both: ''
      }
    },
    defaultVariants: { variant: 'none' }
  }
)

export const sidebarNavListClass = 'flex flex-col gap-1'
// Two child rows (32 each) plus 4px; the stem joins the My Stash row 8px above.
export const sidebarNavTreeClass = 'relative flex flex-col pb-1 pl-5'
export const sidebarNavStemClass = 'absolute -top-2 left-5 h-2 border-l border-base'
