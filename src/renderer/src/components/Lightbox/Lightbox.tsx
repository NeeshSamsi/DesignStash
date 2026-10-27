import { ICON_STROKE } from '@renderer/design-system/icon'
import { useRef, useState } from 'react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CoverImage } from '@renderer/components/CoverImage'
import { guardToaster } from '@renderer/lib/toast-layer'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { SHORTCUT_BOUNDARY_ATTR } from '@renderer/lib/shortcuts'
import { LIGHTBOX_DEFAULTS, type LightboxContractProps } from './Lightbox.types'
import { lightboxCoverClass, lightboxVariants } from './Lightbox.variants'

export interface LightboxProps extends LightboxContractProps {
  /** Live overlay when given; without it the viewer renders in place (catalog). */
  open?: boolean
  onClose?: () => void
  /** The cover file. */
  src?: string
  /** Step to the previous / next mockup in the grid's current order (a pile steps through its variants). */
  onPrev?: () => void
  onNext?: () => void
  /** `missing`: Figma's “Replace cover”. */
  onReplace?: () => void
  /** `missing`: “Check library”, the way forward from a missing file. */
  onCheckLibrary?: () => void
  /** Where focus goes on close. Defaults to whatever had focus when it opened (the card). */
  returnFocusTo?: HTMLElement | null
  className?: string
}

/** Zoom steps as a share of the cover's own pixels; `fit` shrinks it to the stage. */
const ZOOM_STEPS = [0.5, 1, 1.5, 2, 3] as const
type Zoom = 'fit' | (typeof ZOOM_STEPS)[number]

function zoomedIn(zoom: Zoom): Zoom {
  if (zoom === 'fit') return 1
  return ZOOM_STEPS.find((step) => step > zoom) ?? zoom
}

function zoomedOut(zoom: Zoom): Zoom {
  if (zoom === 'fit') return 'fit'
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom) ?? 'fit'
}

/**
 * Lightbox — Full-window cover viewer with zoom and prev/next for pile variants.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-2719
 * A modal-layer overlay: ← → step through the grid, Esc closes it and focus goes back to the card
 * that opened it. Loading is a skeleton block, never a spinner. Respects reduced motion by having
 * no motion of its own.
 */
export function Lightbox({
  className,
  open,
  onClose,
  src,
  onPrev,
  onNext,
  onReplace,
  onCheckLibrary,
  returnFocusTo,
  ...rest
}: LightboxProps) {
  const props = { ...LIGHTBOX_DEFAULTS, ...rest }
  const isLive = open !== undefined
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [natural, setNatural] = useState<number | null>(null)
  // Radix only returns focus to a Trigger; this has none, so remember the card it opened from.
  const opener = useRef<HTMLElement | null>(null)
  const showArrows = isLive ? Boolean(onPrev || onNext) : props.mode === 'group'
  const hasPrev = isLive ? Boolean(onPrev) : true
  const hasNext = isLive ? Boolean(onNext) : true

  const imageStyle =
    zoom !== 'fit' && natural !== null ? { width: natural * zoom, maxWidth: 'none' } : undefined

  const cover = (() => {
    if (props.state === 'loading') {
      return <CoverImage size="lg" state="loading" className={lightboxCoverClass} />
    }
    if (props.state === 'missing') {
      return (
        <div className="flex max-h-full w-full max-w-240 flex-col items-center gap-3">
          <CoverImage
            size="lg"
            state="missing-file"
            {...(onReplace ? { onReplace } : {})}
            className={lightboxCoverClass}
          />
          {onCheckLibrary && (
            <Button variant="secondary" size="sm" onClick={onCheckLibrary}>
              Check library
            </Button>
          )}
        </div>
      )
    }
    if (isLive && src) {
      return (
        <img
          src={src}
          alt={props.caption}
          onLoad={(event) => setNatural(event.currentTarget.naturalWidth)}
          style={imageStyle}
          className={cn('rounded-xl object-contain', zoom === 'fit' && 'max-h-full max-w-full')}
        />
      )
    }
    return <CoverImage size="lg" state="loaded" className={lightboxCoverClass} />
  })()

  const toolbar = (
    <div className="flex items-center justify-between pl-20">
      {isLive ? (
        <DialogPrimitive.Title className="type-body-sm-medium text-foreground">
          {props.caption}
        </DialogPrimitive.Title>
      ) : (
        <p className="type-body-sm-medium text-foreground">{props.caption}</p>
      )}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom out"
          onClick={() => setZoom(zoomedOut(zoom))}
        >
          <HugeiconsIcon icon={ZoomOutAreaIcon} strokeWidth={ICON_STROKE} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom in"
          onClick={() => setZoom(zoomedIn(zoom))}
        >
          <HugeiconsIcon icon={ZoomInAreaIcon} strokeWidth={ICON_STROKE} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={zoom === 'fit'}
          onClick={() => setZoom('fit')}
        >
          Fit
        </Button>
        <Button variant="ghost" size="sm" aria-pressed={zoom === 1} onClick={() => setZoom(1)}>
          100%
        </Button>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={ICON_STROKE} />
        </Button>
      </div>
    </div>
  )

  const stage = (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-6 overflow-auto">
      {showArrows && (
        <Button
          variant="secondary"
          size="icon"
          aria-label="Previous"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={ICON_STROKE} />
        </Button>
      )}
      {cover}
      {showArrows && (
        <Button
          variant="secondary"
          size="icon"
          aria-label="Next"
          disabled={!hasNext}
          onClick={onNext}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={ICON_STROKE} />
        </Button>
      )}
    </div>
  )

  const classes = cn(lightboxVariants({ mode: props.mode, state: props.state }), className)

  if (!isLive) {
    return (
      <div data-ds="Lightbox" data-mode={props.mode} data-state={props.state} className={classes}>
        {toolbar}
        {stage}
      </div>
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose?.()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay duration-(--duration-fast) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          data-ds="Lightbox"
          data-mode={props.mode}
          data-state={props.state}
          // The window's shortcuts stay behind it, as behind every DialogFrame.
          {...{ [SHORTCUT_BOUNDARY_ATTR]: '' }}
          aria-describedby={undefined}
          onInteractOutside={guardToaster()}
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null
          }}
          onCloseAutoFocus={(event) => {
            const card = returnFocusTo ?? opener.current
            if (card?.isConnected) {
              event.preventDefault()
              card.focus()
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' && onPrev) {
              event.preventDefault()
              onPrev()
            } else if (event.key === 'ArrowRight' && onNext) {
              event.preventDefault()
              onNext()
            }
          }}
          className={cn('fixed inset-0 z-50 bg-transparent outline-none', classes)}
        >
          {toolbar}
          {stage}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
