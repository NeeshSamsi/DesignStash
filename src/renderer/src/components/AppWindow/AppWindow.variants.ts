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
  'relative isolate flex min-w-0 flex-1 flex-col overflow-hidden pt-7'

// The page scrolls edge to edge across the panel with its 28px padding inside, so the wheel works anywhere on the
// panel and the scrollbar runs along the panel's own right edge. The page fills the height, so a press below the
// last row is still on the grid.
export const appWindowScrollClass =
  'page-scroll group/scroll flex min-h-0 flex-1 flex-col overflow-auto'
export const appWindowPageClass = 'flex grow flex-col px-7 pb-7 *:grow'

/** A page's bar (PageBar): stays at the top of the scroll area on the panel colour, across the panel's full width. */
export const pageBarClass = 'scroll-state-container sticky top-0 z-20 -mx-7 bg-surface-1 px-7'
/** The frame's edge for pages without a bar: right under the header, gone once the page brings a PageBar. */
export const appWindowEdgeClass =
  'scroll-state-container sticky top-0 z-20 group-has-data-page-bar/scroll:hidden'

/** Blur layers in the scroll edge; their blur and reach are set in main.css (`.ds-scroll-edge`). */
export const SCROLL_EDGE_BLUR_LAYERS = 8
