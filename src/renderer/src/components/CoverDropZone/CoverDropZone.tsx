import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, Upload01Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@renderer/components/Badge'
import { DropOverlay } from '@renderer/components/DropOverlay'
import { Progress } from '@renderer/components/Progress'
import { useCoverIntake } from '@renderer/hooks/use-cover-intake'
import { cn } from '@renderer/lib/utils'
import { COVER_DROP_ZONE_DEFAULTS, type CoverDropZoneContractProps } from './CoverDropZone.types'
import { coverDropZoneVariants } from './CoverDropZone.variants'

export interface CoverDropZoneProps
  extends
    CoverDropZoneContractProps,
    Omit<ComponentProps<'div'>, keyof CoverDropZoneContractProps | 'onDrop'> {
  /** The file that became the cover: the first image of a drop, paste or pick. */
  onCover?: (file: File) => void
  /** Upload progress, 0–100, while `state` is `uploading`. */
  percent?: number
}

/**
 * CoverDropZone — Required cover drop zone (no cover yet). Drag-over is the shared DropOverlay.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-3425
 * Used inside CoverPanel. Click, ↵ or Space opens the file picker; drop and ⌘V work too.
 * A bad file shows the error state here, since there is no old cover to fall back to.
 */
export function CoverDropZone({ className, onCover, percent, ...rest }: CoverDropZoneProps) {
  const { state: given, ...props } = { ...COVER_DROP_ZONE_DEFAULTS, ...rest }
  const intake = useCoverIntake({ onCover })
  const state = intake.drag === 'image' ? 'drag-over' : intake.problem ? 'error' : given
  const overlay = intake.drag ?? (given === 'drag-over' ? 'image' : null)
  const uploading = state === 'uploading'
  const error = state === 'error'

  return (
    <div
      data-ds="CoverDropZone"
      data-state={state}
      role="button"
      tabIndex={uploading ? -1 : 0}
      aria-busy={uploading || undefined}
      aria-label="Add a cover"
      className={cn(coverDropZoneVariants({ state }), className)}
      onClick={intake.openPicker}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          intake.openPicker()
        }
      }}
      {...intake.dropProps}
      {...props}
    >
      <input {...intake.inputProps} />
      <Badge variant="warning">Add a cover to stash it</Badge>
      <div className="flex size-14 items-center justify-center rounded-xl bg-surface-3">
        <HugeiconsIcon
          icon={error ? Alert02Icon : Upload01Icon}
          strokeWidth={ICON_STROKE}
          className={cn('size-6', error ? 'text-error' : 'text-brand')}
        />
      </div>
      <p className="type-body-sm-medium text-foreground">
        {uploading ? 'Uploading cover…' : 'Drop an image here or click to upload'}
      </p>
      <p className={cn('type-caption-xs-regular', error ? 'text-error' : 'text-tertiary')}>
        {error ? 'We couldn’t read that file. Try another image?' : 'PNG, JPG or WebP'}
      </p>
      {uploading && (
        <Progress
          size="sm"
          showLabel={false}
          label="Uploading cover"
          percent={percent ?? 0}
          className="w-60"
        />
      )}
      {overlay && (
        <DropOverlay
          state={overlay === 'rejected' ? 'rejected' : 'drag-over'}
          title={overlay === 'rejected' ? 'That’s not an image' : 'Drop to add a cover'}
          description={
            overlay === 'rejected'
              ? 'Covers can be PNG, JPG or WebP, up to 25 MB'
              : 'PNG, JPG or WebP, up to 25 MB'
          }
        />
      )}
    </div>
  )
}
