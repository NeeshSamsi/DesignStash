import { cva } from 'class-variance-authority'

// Figma CoverDropZone 220:3425. The required cover well: 4:3, dashed, with the drag-over overlay on top.
export const coverDropZoneVariants = cva(
  'relative flex aspect-card w-detail-media cursor-pointer flex-col items-center justify-center gap-3 overflow-clip rounded-xl border border-dashed bg-surface-2 p-8 outline-none focus-visible:ring-2 focus-visible:ring-ring',
  {
    variants: {
      state: {
        idle: 'border-strong',
        'drag-over': 'border-strong',
        uploading: 'pointer-events-none border-strong',
        error: 'border-error'
      }
    },
    defaultVariants: { state: 'idle' }
  }
)
