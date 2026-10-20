import { useState, type ReactNode } from 'react'
import { Cancel01Icon, ZoomInAreaIcon } from '@hugeicons/core-free-icons'
import type { CoverSource } from '@shared/library'
import { Button } from '@renderer/components/Button'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { CoverImage } from '@renderer/components/CoverImage'
import { Lightbox } from '@renderer/components/Lightbox'
import { Tooltip } from '@renderer/components/Tooltip'
import { cn } from '@renderer/lib/utils'
import { useDetailsStore } from '@renderer/stores/detailsStore'
import { photoshopFailureCopy } from './detail-edits'
import { checkLibrary } from './check-library'
import type { PhotoshopFailure } from './use-details-data'

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
          <h2 className="truncate type-title-lg-semibold text-foreground">{title}</h2>
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

/** The cover at full width, 4:3, with a small button at its corner that opens the full-screen viewer. */
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
      <Tooltip label="Full screen" arrow="top-right">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Full screen"
          iconStart={ZoomInAreaIcon}
          showIconStart
          className="absolute right-2.5 bottom-2.5"
          onClick={() => setZoom(true)}
        />
      </Tooltip>
      <Lightbox
        open={zoom}
        mode="single"
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
