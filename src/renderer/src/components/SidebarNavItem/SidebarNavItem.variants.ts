import { cva } from 'class-variance-authority'

// Figma SidebarNav Item 218:1828. hover/focus are CSS; active = background/selected.
// parent rows are text-foreground; child rows (under a TreeBranch) are text-tertiary until active.
export const sidebarNavItemVariants = cva(
  'flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-1.5 text-left outline-none transition-colors hover:bg-surface-2-hover focus-visible:focus-ring',
  {
    variants: {
      variant: {
        parent: 'text-foreground',
        child: 'text-tertiary'
      },
      active: {
        true: 'bg-selected text-foreground hover:bg-selected',
        false: ''
      }
    },
    defaultVariants: { variant: 'parent', active: false }
  }
)
