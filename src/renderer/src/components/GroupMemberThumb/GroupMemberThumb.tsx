import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps, MouseEvent } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { CoverImage } from '@renderer/components/CoverImage'
import { MiddleTruncatedText } from '@renderer/lib/middle-truncated-text'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/components/Badge'
import {
  GROUP_MEMBER_THUMB_DEFAULTS,
  type GroupMemberThumbContractProps
} from './GroupMemberThumb.types'
import { groupMemberCaptionVariants, groupMemberThumbVariants } from './GroupMemberThumb.variants'

export interface GroupMemberThumbProps
  extends
    GroupMemberThumbContractProps,
    Omit<ComponentProps<'div'>, keyof GroupMemberThumbContractProps> {
  /** Selection id: the board finds the tile by `data-tile-id`. */
  tileId?: string
  /** The cover file. Without it the tile shows the device placeholder. */
  coverSrc?: string
  /** The ⋯ menu (same menu as right-click). Shown on hover and when selected. */
  onMore?: (event: MouseEvent<HTMLButtonElement>) => void
  /** "Start a pile" on a `pile-target`. */
  dropHint?: string
}

/**
 * GroupMemberThumb — A mockup tile inside a pile on the Sort board: cover on top, filename in a caption bar.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-2979
 * Used by the Sort board. Top row: the Top badge and the ⋯ menu. States: idle · hover (CSS, the cover zooms
 * like the library card) · selected · lifted · left-behind · drop-ghost · pile-target. The Figma name Primary is "Top" in the UI.
 */
export function GroupMemberThumb({
  className,
  tileId,
  coverSrc,
  onMore,
  dropHint = 'Start a pile',
  ...rest
}: GroupMemberThumbProps) {
  const { state, primary, filename, ...props } = { ...GROUP_MEMBER_THUMB_DEFAULTS, ...rest }
  const ghost = state === 'drop-ghost'
  const away = state === 'left-behind'
  const showMore = !ghost && !away && onMore !== undefined && state !== 'pile-target'
  return (
    <div
      data-ds="GroupMemberThumb"
      data-state={state}
      data-tile-id={tileId}
      aria-selected={state === 'selected' || undefined}
      aria-hidden={ghost || away || undefined}
      className={cn(groupMemberThumbVariants({ state }), className)}
      {...props}
    >
      {!ghost && (
        <>
          <div className={cn('h-23 overflow-clip', away && 'opacity-0')}>
            <CoverImage
              size="sm"
              {...(coverSrc ? { src: coverSrc } : {})}
              imageClassName="group-hover/thumb:scale-105"
              className="size-full rounded-none"
            />
          </div>
          <div className={groupMemberCaptionVariants({ state })}>
            <MiddleTruncatedText className="flex-1">{filename}</MiddleTruncatedText>
          </div>
          <div
            className={cn('absolute inset-x-1 top-1 flex items-center gap-1', away && 'opacity-0')}
          >
            {primary && <Badge variant="primary">Top</Badge>}
            {state === 'pile-target' && <Badge variant="primary">{dropHint}</Badge>}
            <span className="flex-1" />
            {showMore && (
              <button
                type="button"
                aria-label={`More actions for ${filename}`}
                aria-haspopup="menu"
                onClick={(event) => {
                  event.stopPropagation()
                  onMore(event)
                }}
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-lg bg-overlay text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5',
                  state === 'idle' &&
                    'opacity-0 group-hover/thumb:opacity-100 focus-visible:opacity-100'
                )}
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={ICON_STROKE} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
