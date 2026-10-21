import { useState, type ReactNode } from 'react'
import { Cancel01Icon, ZoomInAreaIcon } from '@hugeicons/core-free-icons'
import type { CoverSource } from '@shared/library'
import { Button } from '@renderer/components/Button'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { CoverImage } from '@renderer/components/CoverImage'
import { CoverPanel } from '@renderer/components/CoverPanel'
import { Lightbox } from '@renderer/components/Lightbox'
import { cn } from '@renderer/lib/utils'
import { TruncatedText } from '@renderer/lib/truncated-text'
import { useDetailsStore } from '@renderer/stores/detailsStore'
import { panelSource, photoshopFailureCopy } from './detail-edits'
import { checkLibrary } from './check-library'
import type { CoverUi, PhotoshopFailure } from './use-details-data'

export interface SidebarHeaderProps {
  /** Left out while editing: the title is a field then. */
  title?: string
  caption: string
  /** The controls before ✕: the star, or the expand icon. */
  children?: ReactNode
}

/**
 * The sidebar's head: title and caption on the left, controls and ✕ on the right. Every item sits on
 * one centred row, so ✕ lines up with the caption and nothing leaves a gap before the cover.
 */
export function SidebarHeader({ title, caption, children }: SidebarHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title !== undefined && (
          <TruncatedText as="h2" className="type-title-lg-semibold text-foreground">
            {title}
          </TruncatedText>
        )}
        <p className="truncate type-caption-xs-regular text-tertiary">{caption}</p>
      </div>
      {children}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close"
        iconStart={Cancel01Icon}
        showIconStart
        onClick={() => useDetailsStore.getState().close()}
      />
    </div>
  )
}

export interface SidebarCoverProps {
  src: string | undefined
  title: string
  coverSource: CoverSource
  missing: boolean
}

/** The cover at full width, 4:3, with a Zoom button at its corner that opens the full-screen viewer. */
export function SidebarCover({ src, title, coverSource, missing }: SidebarCoverProps) {
  const [zoom, setZoom] = useState(false)
  const state = missing ? 'missing-file' : !src || coverSource === 'none' ? 'no-preview' : 'loaded'
  return (
    <div className="relative aspect-4/3 w-full shrink-0">
      <CoverImage
        size="lg"
        state={state}
        alt={title}
        {...(src ? { src } : {})}
        className="size-full rounded-card-cover"
      />
      {/* Same name and icon as the edit form's Zoom, so the control reads alike in both modes. */}
      <Button
        variant="secondary"
        size="sm"
        label="Zoom"
        iconStart={ZoomInAreaIcon}
        showIconStart
        className="absolute right-2.5 bottom-2.5"
        onClick={() => setZoom(true)}
      />
      <Lightbox
        open={zoom}
        mode="single"
        caption={title}
        state={missing ? 'missing' : 'loaded'}
        {...(src ? { src } : {})}
        onClose={() => setZoom(false)}
        onCheckLibrary={() => {
          setZoom(false)
          void checkLibrary()
        }}
      />
    </div>
  )
}

export interface EditableCoverProps {
  /** Names the full-screen viewer: the title as it stands in the form. */
  title: string
  src: string | undefined
  coverPath: string
  coverSource: CoverSource
  missing: boolean
  ui: CoverUi
  imageSize: { width: number; height: number } | undefined
  onCover: (file: File) => void
  onUsePsdPreview: () => void
  onCancelReplace: () => void
}

/**
 * The cover in edit mode (Figma D2.3 C1): the CoverPanel, which can replace it (pick, drop or paste),
 * go back to the PSD's preview, and zoom. A change applies at once with an Undo toast; it is not part
 * of what Save commits.
 */
export function EditableCover({
  title,
  src,
  coverPath,
  coverSource,
  missing,
  ui,
  imageSize,
  onCover,
  onUsePsdPreview,
  onCancelReplace
}: EditableCoverProps) {
  const [zoom, setZoom] = useState(false)
  return (
    <>
      <CoverPanel
        source={panelSource(coverPath, coverSource)}
        state={ui}
        coverMissing={missing}
        showDeck={false}
        {...(src ? { coverSrc: src } : {})}
        {...(imageSize ? { imageSize } : {})}
        className="w-full shrink-0"
        onCover={onCover}
        onUsePsdPreview={onUsePsdPreview}
        onCancelReplace={onCancelReplace}
        onZoom={() => setZoom(true)}
      />
      <Lightbox
        open={zoom}
        mode="single"
        caption={title}
        state={missing ? 'missing' : 'loaded'}
        {...(src ? { src } : {})}
        onClose={() => setZoom(false)}
        onCheckLibrary={() => {
          setZoom(false)
          void checkLibrary()
        }}
      />
    </>
  )
}

/** The buttons along the bottom, full width, light to heavy: the heaviest is last. */
export function SidebarActions({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('flex shrink-0 flex-col gap-2', className)}>{children}</div>
}

/** What to do when Photoshop does not open: say why, offer one more try. */
export function PhotoshopAsk({
  failure,
  onCancel,
  onRetry
}: {
  failure: PhotoshopFailure | null
  onCancel: () => void
  onRetry: () => void
}) {
  const copy = photoshopFailureCopy(failure ?? 'failed')
  return (
    <ConfirmDialog
      open={failure !== null}
      variant="neutral"
      detail={false}
      title={copy.title}
      description={copy.description}
      cancelLabel="Cancel"
      confirmLabel="Try again"
      onCancel={onCancel}
      onConfirm={onRetry}
    />
  )
}
