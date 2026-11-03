import { cva } from 'class-variance-authority'

// Figma DropOverlay 218:1990: the window-wide drop state. drag-over = primary dashes,
// rejected = error dashes (no PSDs), queued = warning fill (an import is already running).
export const dropOverlayVariants = cva(
  'pointer-events-none absolute inset-0 z-50 flex flex-col bg-overlay p-6',
  {
    variants: {
      state: {
        'drag-over': '',
        rejected: '',
        queued: ''
      }
    },
    defaultVariants: { state: 'drag-over' }
  }
)

export const dropOverlayZoneVariants = cva(
  'flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl border-2 border-dashed',
  {
    variants: {
      state: {
        'drag-over': 'border-primary bg-overlay',
        rejected: 'border-error bg-overlay',
        queued: 'border-warning bg-warning-weak'
      }
    },
    defaultVariants: { state: 'drag-over' }
  }
)

export const dropOverlayIconVariants = cva('size-6', {
  variants: {
    state: {
      'drag-over': 'text-brand',
      rejected: 'text-error',
      queued: 'text-warning'
    }
  },
  defaultVariants: { state: 'drag-over' }
})

// display/2xl over the window; title/lg inside the cover, where the display size was clipped.
export const dropOverlayTitleVariants = cva('text-foreground', {
  variants: {
    compact: {
      true: 'type-title-lg-semibold',
      false: 'type-display-2xl-medium'
    }
  },
  defaultVariants: { compact: false }
})
