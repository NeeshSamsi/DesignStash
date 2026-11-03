import { useEffect, useMemo, useRef, type ComponentProps } from 'react'
import { Image01Icon, Refresh01Icon, ZoomInAreaIcon } from '@hugeicons/core-free-icons'
import { coverFit } from '@shared/cover-fit'
import { Badge } from '@renderer/components/Badge'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { CoverDropZone } from '@renderer/components/CoverDropZone'
import { CoverImage } from '@renderer/components/CoverImage'
import { DropOverlay } from '@renderer/components/DropOverlay'
import { Progress } from '@renderer/components/Progress'
import { useCoverIntake } from '@renderer/hooks/use-cover-intake'
import { cn } from '@renderer/lib/utils'
import { COVER_PANEL_DEFAULTS, type CoverPanelContractProps } from './CoverPanel.types'
import { useDeckMotion } from './use-deck-motion'
import { COVER_HOVER, COVER_WELL, DECK_CARD, coverPanelVariants } from './CoverPanel.variants'

export interface CoverPanelProps
  extends CoverPanelContractProps, Omit<ComponentProps<'div'>, keyof CoverPanelContractProps> {
  /** The cover file. Without it the panel shows the device placeholder. */
  coverSrc?: string
  /** The image's pixel size. When given, `bars` and the note are derived from it and never set by hand. */
  imageSize?: { width: number; height: number }
  /** The cover file is gone from the stash folder: offers Replace cover. */
  coverMissing?: boolean
  /** Upload progress, 0–100, while `state` is `replacing` or `uploading`. */
  percent?: number
  /** Replaces the error Banner's message when `state` is `error`. */
  errorMessage?: string
  /** The file that became the cover: the first image of a drop, paste or pick. */
  onCover?: (file: File) => void
  /** Zoom, or Space on the cover, opens the Lightbox. */
  onZoom?: () => void
  /**
   * "Use the PSD’s preview", offered on an uploaded cover. A sidecar only stands in when the PSD has
   * no preview of its own or its own is the kit's notice, so it is never offered there.
   */
  onUsePsdPreview?: () => void
  /** Esc while replacing. The old cover stays. */
  onCancelReplace?: () => void
  /**
   * Which variant of the pile is shown. When it changes the deck moves (D1.4): the old top card slides
   * away and the cards behind rise, or the reverse going back; reduced motion is a short crossfade.
   */
  variantIndex?: number
}

/**
 * The source tag. The PSD's own preview is the normal case and says nothing; a chosen cover says so.
 * A sidecar image is used automatically when the PSD has no preview of its own, or when its own is
 * only the kit's notice ("Delete this layer"), so it is always the cover.
 */
const SOURCE_TAG = {
  embedded: '',
  sidecar: 'Sidecar image',
  uploaded: 'Uploaded',
  none: ''
} as const

/** An embedded preview whose longer side is under this looks soft at cover size, so it is flagged. */
const LOW_RES_PX = 800

const ERROR_TITLE = 'We couldn’t use that image'
const ERROR_MESSAGE = 'Your cover hasn’t changed. Try another file (PNG, JPG or WebP, up to 25 MB).'

/**
 * CoverPanel — Cover in Look it over and Detail: the image plus a tag row (source tag · optional note · Zoom).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-3545
 * Used by Detail and Look it over. Hover reveals Replace; drag-over is the shared DropOverlay;
 * replacing keeps the old cover dimmed; no cover at all is the required CoverDropZone.
 * Crop or bars: design/specs/cover.md.
 */
export function CoverPanel({
  className,
  coverSrc,
  imageSize,
  coverMissing = false,
  percent,
  errorMessage,
  onCover,
  onZoom,
  onUsePsdPreview,
  onCancelReplace,
  variantIndex,
  ...rest
}: CoverPanelProps) {
  const {
    source,
    state: given,
    showNote,
    bars: givenBars,
    showDeck,
    deckMore,
    note: givenNote,
    deckLabel,
    ...props
  } = { ...COVER_PANEL_DEFAULTS, ...rest }

  const coverRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLImageElement>(null)
  const deck1Ref = useRef<HTMLDivElement>(null)
  const deck2Ref = useRef<HTMLDivElement>(null)
  const targets = useMemo(
    () => ({ cover: coverRef, ghost: ghostRef, deck1: deck1Ref, deck2: deck2Ref }),
    []
  )
  useDeckMotion(variantIndex, coverSrc, targets)

  const intake = useCoverIntake({ onCover, paste: source !== 'none' })
  const fit = imageSize ? coverFit(imageSize.width, imageSize.height) : null
  const bars = fit ? fit.mode === 'bars' : givenBars
  const note = fit ? fit.note : givenNote
  const noteShown = fit ? fit.note !== null : showNote

  const state = intake.drag === 'image' ? 'drag-over' : given
  const replacing = state === 'replacing' || state === 'uploading'
  const failed = state === 'error' || intake.problem !== null
  const hoverable = state === 'default' && !coverMissing
  const lowRes = imageSize !== undefined && Math.max(imageSize.width, imageSize.height) < LOW_RES_PX
  const tag = SOURCE_TAG[source] || (lowRes ? 'Low-res preview' : '')
  const overlay = intake.drag ?? (given === 'drag-over' ? 'image' : null)

  // Esc cancels a replace and keeps the old cover.
  useEffect(() => {
    if (!replacing || !onCancelReplace) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onCancelReplace()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [replacing, onCancelReplace])

  if (source === 'none') {
    return (
      <div
        data-ds="CoverPanel"
        data-source="none"
        className={cn(coverPanelVariants({ source, state: given }), className)}
        {...props}
      >
        <CoverDropZone
          state={given === 'default' ? 'idle' : given === 'replacing' ? 'uploading' : given}
          {...(onCover ? { onCover } : {})}
          {...(percent !== undefined ? { percent } : {})}
        />
      </div>
    )
  }

  return (
    <div
      data-ds="CoverPanel"
      data-source={source}
      data-state={state}
      className={cn(coverPanelVariants({ source, state }), className)}
      {...props}
      {...intake.dropProps}
    >
      <input {...intake.inputProps} />

      {showDeck && (
        <div
          ref={deck1Ref}
          aria-hidden
          data-deck="1"
          className={cn(DECK_CARD, 'top-1.5 left-1.5 h-87 opacity-80')}
        />
      )}
      {showDeck && deckMore && (
        <div
          ref={deck2Ref}
          aria-hidden
          data-deck="2"
          className={cn(DECK_CARD, 'top-deck-peek left-deck-peek h-84 opacity-55')}
        />
      )}

      <div
        ref={coverRef}
        role="group"
        aria-label="Cover"
        tabIndex={0}
        data-fit={bars ? 'bars' : 'crop'}
        className={cn(COVER_WELL, bars && 'bg-surface-1')}
        onKeyDown={(event) => {
          if (event.key === ' ' && event.target === event.currentTarget && onZoom) {
            event.preventDefault()
            onZoom()
          }
        }}
      >
        {coverMissing ? (
          <CoverImage
            size="lg"
            state="missing-file"
            className="size-full"
            onReplace={intake.openPicker}
          />
        ) : bars && coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            className={cn('size-full object-contain', replacing && 'opacity-40')}
          />
        ) : (
          <CoverImage
            size="lg"
            {...(coverSrc ? { src: coverSrc } : {})}
            className={cn('size-full', replacing && 'opacity-40')}
          />
        )}

        <img
          ref={ghostRef}
          alt=""
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 size-full opacity-0',
            bars ? 'object-contain' : 'object-cover'
          )}
        />

        {showDeck && deckLabel !== '' && (
          <Badge variant="secondary" className="absolute top-3 left-3">
            {deckLabel}
          </Badge>
        )}

        {hoverable && (
          <div className={COVER_HOVER}>
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                size="sm"
                label="Replace"
                showIconStart
                iconStart={Refresh01Icon}
                className="w-full"
                onClick={intake.openPicker}
              />
              {source === 'uploaded' && (
                <Button
                  variant="secondary"
                  size="sm"
                  label="Use the PSD’s preview"
                  showIconStart
                  iconStart={Image01Icon}
                  className="w-full"
                  onClick={onUsePsdPreview}
                />
              )}
            </div>
            <p className="type-caption-xs-regular text-muted-foreground">
              or drop or paste an image to replace
            </p>
          </div>
        )}

        {replacing && (
          <div
            role="status"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-overlay"
          >
            <p className="type-body-sm-medium text-foreground">Replacing cover…</p>
            <Progress
              size="sm"
              showLabel={false}
              label="Replacing cover"
              percent={percent ?? 0}
              className="w-50"
            />
          </div>
        )}

        {overlay && (
          <DropOverlay
            compact
            state={overlay === 'rejected' ? 'rejected' : 'drag-over'}
            title={overlay === 'rejected' ? 'That’s not an image' : 'Drop to use as cover'}
            description={
              overlay === 'rejected'
                ? 'Covers can be PNG, JPG or WebP, up to 25 MB'
                : 'Replaces the current cover'
            }
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        {tag && <Badge variant="secondary">{tag}</Badge>}
        <div
          className="min-w-0 flex-1 truncate type-caption-xs-regular text-tertiary"
          role="status"
        >
          {intake.notice ?? (noteShown ? note : null)}
        </div>
        <Button
          variant="ghost"
          size="xs"
          label="Zoom"
          showIconStart
          iconStart={ZoomInAreaIcon}
          onClick={onZoom}
        />
      </div>

      {failed && (
        <Banner
          tone="error"
          title={ERROR_TITLE}
          message={intake.problem ? ERROR_MESSAGE : (errorMessage ?? ERROR_MESSAGE)}
          action={false}
          onDismiss={intake.dismissProblem}
        />
      )}
    </div>
  )
}
