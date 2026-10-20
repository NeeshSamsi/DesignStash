import {
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent
} from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon, Crown03Icon } from '@hugeicons/core-free-icons'
import { Button } from '@renderer/components/Button'
import { VariantThumb } from '@renderer/components/VariantThumb'
import {
  clampOffset,
  offsetToShow,
  overflowState,
  settleOffset,
  stepIndex,
  VARIANT_SLOT_PX
} from '@renderer/lib/variant-slots'
import { cn } from '@renderer/lib/utils'
import { VARIANT_STRIP_DEFAULTS, type VariantStripContractProps } from './VariantStrip.types'
import {
  STRIP_ARROW,
  STRIP_FADE,
  STRIP_TRACK,
  STRIP_WINDOW,
  variantStripVariants
} from './VariantStrip.variants'

export interface StripVariant {
  id: string
  /** The variant's name: "front", "side", "¾ left". */
  label: string
  coverSrc?: string
  /** The top mockup of the pile: marked with the crown. */
  top?: boolean
  /** The cover file is gone. */
  missingCover?: boolean
}

export interface VariantStripProps
  extends VariantStripContractProps, Omit<ComponentProps<'div'>, keyof VariantStripContractProps> {
  /** The pile's variants in order. Without them the strip shows Figma's sample pile. */
  variants?: readonly StripVariant[]
  /** The variant on the cover. */
  shownId?: string
  /** A thumbnail, ‹ ›, or ← → picked this variant. */
  onShow?: (id: string) => void
  /** "Put on top" for the shown variant. */
  onPutOnTop?: (id: string) => void
}

const NAMES = [
  'front',
  'side',
  'back',
  'top',
  'left',
  'right',
  '¾ left',
  '¾ right',
  'flat',
  'in hand',
  'on desk',
  'close-up'
]

/** Figma's sample pile, for the catalog: 4 variants when it fits, 12 when it scrolls. */
function sampleVariants(overflow: VariantStripContractProps['overflow'], missingCover: boolean) {
  const count = overflow === 'fits' ? 4 : NAMES.length
  return NAMES.slice(0, count).map<StripVariant>((label, index) => ({
    id: label,
    label,
    top: index === 0,
    missingCover: missingCover && index === 2
  }))
}
const SAMPLE_START = { fits: [0, 0], start: [0, 0], scrolled: [4, 6], end: [7, 11] } as const

/** A drag, or this much wheel, has to travel this far before it counts. */
const DRAG_THRESHOLD_PX = 4
const WHEEL_STEP_PX = 60

/**
 * VariantStrip — A pile's variants under the cover (V1a): VariantThumbs on fixed 92px slots from the
 * cover's left edge, an arrow on a fade only at an end with more, and a status row (name · n of N,
 * then the Top mark or Put on top).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=222-3432
 * Used by Detail and Look it over. Arrows, ← →, a drag or the wheel always settle on a slot. Stepping keeps the shown
 * variant in a clear slot (2nd to 4th), and stepping onto a faded end scrolls one slot.
 */
export function VariantStrip({
  className,
  variants: given,
  shownId: givenShownId,
  onShow,
  onPutOnTop,
  onKeyDown,
  ...rest
}: VariantStripProps) {
  const {
    overflow: previewOverflow,
    missingCover,
    ...props
  } = { ...VARIANT_STRIP_DEFAULTS, ...rest }
  const variants = given ?? sampleVariants(previewOverflow, missingCover)
  const count = variants.length
  const [sampleOffset, sampleShown] = given ? [undefined, undefined] : SAMPLE_START[previewOverflow]

  const [innerShownId, setInnerShownId] = useState(variants[sampleShown ?? 0]?.id)
  const shownId = givenShownId ?? innerShownId
  const found = variants.findIndex((variant) => variant.id === shownId)
  const shownIndex = found === -1 ? 0 : found
  const shown = variants[shownIndex]

  const [offset, setOffset] = useState(() =>
    clampOffset(sampleOffset ?? offsetToShow(shownIndex, 0, count), count)
  )
  // The catalog's sample pile follows its `overflow` preview (adjusting state while rendering).
  const [seenPreview, setSeenPreview] = useState(previewOverflow)
  if (!given && seenPreview !== previewOverflow) {
    setSeenPreview(previewOverflow)
    setOffset(clampOffset(sampleOffset ?? 0, count))
    setInnerShownId(variants[sampleShown ?? 0]?.id)
  }
  // Keep the shown variant in a clear slot whenever it changes (adjusting state while rendering).
  const [seenIndex, setSeenIndex] = useState(shownIndex)
  if (seenIndex !== shownIndex) {
    setSeenIndex(shownIndex)
    setOffset((current) => offsetToShow(shownIndex, current, count))
  }
  const at = clampOffset(offset, count)
  const state = overflowState(at, count)

  const [dragPx, setDragPx] = useState(0)
  const drag = useRef<{ x: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const wheel = useRef(0)

  const show = (index: number) => {
    const next = variants[index]
    if (!next || next.id === shownId) return
    setInnerShownId(next.id)
    onShow?.(next.id)
  }
  const step = (delta: -1 | 1) => show(stepIndex(shownIndex, delta, count))
  const scrollBy = (slots: number) => setOffset((current) => clampOffset(current + slots, count))

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      step(event.key === 'ArrowLeft' ? -1 : 1)
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || count <= 1 || state === 'fits') return
    drag.current = { x: event.clientX, moved: false }
  }
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.x
    if (!current.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return
    current.moved = true
    setDragPx(dx)
  }
  const endDrag = () => {
    const current = drag.current
    drag.current = null
    if (!current?.moved) return
    // The dragged content moved right by dragPx, so the strip scrolled left by that much.
    setOffset((offsetNow) => settleOffset(offsetNow, -dragPx, count))
    setDragPx(0)
    // The click that ends a drag must not pick a thumbnail.
    suppressClick.current = true
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.shiftKey
          ? event.deltaY
          : 0
    if (delta === 0 || state === 'fits') return
    wheel.current += delta
    if (Math.abs(wheel.current) >= WHEEL_STEP_PX) {
      scrollBy(wheel.current > 0 ? 1 : -1)
      wheel.current = 0
    }
  }

  return (
    <div
      data-ds="VariantStrip"
      data-overflow={state}
      role="group"
      aria-label="Variants"
      className={cn(variantStripVariants({ overflow: state }), className)}
      onKeyDown={handleKeyDown}
      {...props}
    >
      <div
        className={STRIP_WINDOW}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={handleWheel}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.stopPropagation()
            event.preventDefault()
          }
        }}
      >
        <div
          className={cn(STRIP_TRACK, dragPx !== 0 && 'transition-none')}
          style={{ transform: `translateX(${dragPx - at * VARIANT_SLOT_PX}px)` }}
        >
          {variants.map((variant, index) => (
            <VariantThumb
              key={variant.id}
              label={variant.label}
              top={variant.top ?? false}
              state={
                variant.missingCover ? 'missing-cover' : index === shownIndex ? 'shown' : 'idle'
              }
              {...(variant.coverSrc ? { coverSrc: variant.coverSrc } : {})}
              onClick={() => show(index)}
            />
          ))}
        </div>

        {(state === 'scrolled' || state === 'end') && (
          <>
            <div aria-hidden className={cn(STRIP_FADE, 'left-0 bg-linear-to-l')} />
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous variant"
              iconStart={ArrowLeft01Icon}
              showIconStart
              className={cn(STRIP_ARROW, 'left-0')}
              onClick={() => step(-1)}
            />
          </>
        )}
        {(state === 'start' || state === 'scrolled') && (
          <>
            <div aria-hidden className={cn(STRIP_FADE, 'right-0 bg-linear-to-r')} />
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next variant"
              iconStart={ArrowRight01Icon}
              showIconStart
              className={cn(STRIP_ARROW, 'right-0')}
              onClick={() => step(1)}
            />
          </>
        )}
      </div>

      <div className="flex min-h-6 items-center justify-between">
        <p role="status" className="type-caption-xs-regular text-muted-foreground">
          {shown ? `${shown.label} · ${shownIndex + 1} of ${count}` : ''}
        </p>
        {shown?.top ? (
          <p className="flex items-center gap-1 type-label-xs-medium text-tertiary">
            <HugeiconsIcon icon={Crown03Icon} strokeWidth={1.25} className="size-2.5" />
            Top
          </p>
        ) : (
          shown && (
            <Button
              variant="ghost"
              size="xs"
              label="Put on top"
              showIconStart
              iconStart={Crown03Icon}
              onClick={() => onPutOnTop?.(shown.id)}
            />
          )
        )}
      </div>
    </div>
  )
}
