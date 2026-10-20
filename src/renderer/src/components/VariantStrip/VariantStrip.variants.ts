import { cva } from 'class-variance-authority'

// Figma VariantStrip 222:3432. 84px of thumbnails under the 480px cover, then a 24px status row.
// The overflow state decides which end gets a 56px fade with its arrow on top.
export const variantStripVariants = cva('flex w-detail-media flex-col gap-3', {
  variants: {
    overflow: { fits: '', start: '', scrolled: '', end: '' }
  },
  defaultVariants: { overflow: 'fits' }
})

/** The clipped window the thumbnails slide in. */
export const STRIP_WINDOW = 'relative h-21 w-full touch-pan-y overflow-hidden select-none'

/** Thumbnails on fixed slots: 84px thumbs on an 8px gap, so every slot is `w-variant-slot`. */
export const STRIP_TRACK =
  'flex w-max items-start gap-2 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out'

export const STRIP_FADE =
  'pointer-events-none absolute inset-y-0 w-14 from-transparent via-surface-2/90 via-70% to-surface-2'

export const STRIP_ARROW = 'absolute top-3.5'
