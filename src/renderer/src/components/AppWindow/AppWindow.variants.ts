import { cva } from 'class-variance-authority'

// Figma AppWindow 218:2248: surface-2 window; sidebar (w-sidebar) on the left; the content panel
// is surface-1 with a 24px top-left radius and 28px padding (one step under Figma's 32). The GlobalSearch is centred over the panel.
export const appWindowVariants = cva(
  'relative flex h-full w-full flex-col overflow-hidden bg-surface-2',
  {
    variants: {
      state: {
        idle: '',
        'modal-open': '',
        'drag-over': ''
      }
    },
    defaultVariants: { state: 'idle' }
  }
)

export const appWindowTitleBarClass = 'app-drag flex shrink-0 py-3'
export const appWindowPanelClass =
  'relative isolate flex min-w-0 flex-1 flex-col overflow-hidden p-7'
