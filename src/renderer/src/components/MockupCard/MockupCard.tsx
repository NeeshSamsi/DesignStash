import type { ComponentProps, KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Layers01Icon,
  LinkSquare02Icon,
  MoreHorizontalIcon,
  UndoIcon,
  ZoomInAreaIcon
} from '@hugeicons/core-free-icons'
import { Badge } from '@renderer/ui/badge'
import { Skeleton } from '@renderer/ui/skeleton'
import { Button } from '@renderer/components/Button'
import { CoverImage } from '@renderer/components/CoverImage'
import { FavouriteToggle } from '@renderer/components/FavouriteToggle'
import { cn } from '@renderer/lib/utils'
import {
  MOCKUP_CARD_DEFAULTS,
  type MockupCardContractProps,
  type MockupCardState
} from './MockupCard.types'
import {
  mockupCardCoverVariants,
  mockupCardVariants,
  OVERLAY_ICON_BUTTON,
  REVEAL_ON_HOVER
} from './MockupCard.variants'

export interface MockupCardProps
  extends MockupCardContractProps, Omit<ComponentProps<'div'>, keyof MockupCardContractProps> {
  /** Selection id: the grid finds the card by `data-mockup-id`. Leave it off for cards that must not be selectable. */
  mockupId?: string
  /** The cover file. Without it the cover shows a placeholder. */
  coverSrc?: string
  /** Variants in the pile, shown as "+N". 0 (the default) shows no badge. */
  variantCount?: number
  /** Starred. Shows the filled star at rest; unstarred cards show an outline star on hover. Default off. */
  favourite?: boolean
  /** Quiet status badge on pending-review cards when `showStatus` is on, e.g. "Sniffing…". Nothing shows without it. */
  status?: string
  /** Relative time on a trash card, e.g. "2 days ago". It replaces the tag line as "Trashed 2 days ago". */
  trashedAgo?: string
  onToggleFavourite?: (favourite: boolean) => void
  /** The ⋯ button. Open the card menu from here, the same menu as right-click. */
  onMore?: (event: MouseEvent<HTMLButtonElement>) => void
  onOpenInPhotoshop?: () => void
  onEditDetails?: () => void
  /** Compact cards: the icon-only Preview button. */
  onPreview?: () => void
  onLookItOver?: () => void
  onRestore?: () => void
  onDeleteForever?: () => void
}

/** Card body is selection: clicks, double-clicks and keys from the action controls never reach it. */
const keepToControl = {
  onClick: (event: MouseEvent) => event.stopPropagation(),
  onDoubleClick: (event: MouseEvent) => event.stopPropagation(),
  onKeyDown: (event: KeyboardEvent) => event.stopPropagation()
}

const COVER_STATE: Record<MockupCardState, 'loaded' | 'loading' | 'no-preview' | 'missing-file'> = {
  default: 'loaded',
  selected: 'loaded',
  loading: 'loading',
  'no-preview': 'no-preview',
  'cover-missing': 'missing-file',
  'left-behind': 'loaded',
  'group-target': 'loaded'
}

/**
 * MockupCard — A mockup in any grid: squircle container, cover zoom on hover, Open in Photoshop / Edit details over the cover.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1492
 * Today: MockupTile.tsx. The body is selection (click selects; double-click or ↵ opens Detail, wired by the screen);
 * the buttons fire only their own action. Hover is CSS, so Figma's hover and focus states need no props.
 */
export function MockupCard({
  className,
  mockupId,
  coverSrc,
  variantCount = 0,
  favourite = false,
  status,
  trashedAgo,
  onToggleFavourite,
  onMore,
  onOpenInPhotoshop,
  onEditDetails,
  onPreview,
  onLookItOver,
  onRestore,
  onDeleteForever,
  ...rest
}: MockupCardProps) {
  const {
    variant,
    state,
    showVariants,
    showFavourite,
    showTags,
    showStatus,
    title,
    tags,
    dropHint,
    ...props
  } = { ...MOCKUP_CARD_DEFAULTS, ...rest }

  const loading = state === 'loading'
  const leftBehind = state === 'left-behind'
  const compact = variant === 'compact'
  const interactive = !loading && !leftBehind
  const tagLine = variant === 'trash' && trashedAgo ? `Trashed ${trashedAgo}` : tags

  return (
    <div
      data-ds="MockupCard"
      data-mockup-id={mockupId}
      data-variant={variant}
      data-state={state === 'selected' ? 'selected' : undefined}
      aria-busy={loading || undefined}
      tabIndex={interactive ? 0 : undefined}
      className={cn(mockupCardVariants({ variant, state }), className)}
      {...props}
    >
      <div className={mockupCardCoverVariants({ variant, hidden: leftBehind })}>
        <CoverImage
          size="md"
          state={COVER_STATE[state]}
          {...(coverSrc ? { src: coverSrc } : {})}
          imageClassName="group-hover/card:scale-105"
          className="size-full"
        />

        <div className="absolute top-2 left-2 flex gap-1">
          {variant === 'pending-review' && showStatus && status && (
            <Badge variant="warning">{status}</Badge>
          )}
          {showVariants && variantCount > 0 && !loading && (
            <Badge variant="count" className="px-2 text-secondary">
              +{variantCount}
            </Badge>
          )}
        </div>

        {interactive && (variant === 'library' || compact) && showFavourite && (
          <div className="absolute top-2 right-2 flex gap-1" {...keepToControl}>
            <FavouriteToggle
              pressed={favourite}
              {...(onToggleFavourite ? { onPressedChange: onToggleFavourite } : {})}
              aria-label={favourite ? `Remove star from ${title}` : `Star ${title}`}
              className={cn(
                !favourite &&
                  'hidden group-hover/card:inline-flex group-has-focus-visible/card:inline-flex'
              )}
            />
            {variant === 'library' && (
              <button
                type="button"
                aria-label={`More actions for ${title}`}
                aria-haspopup="menu"
                onClick={onMore}
                className={cn(OVERLAY_ICON_BUTTON, REVEAL_ON_HOVER)}
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}

        {interactive && variant === 'library' && (
          <HoverActions>
            <Button
              size="sm"
              label="Open in Photoshop"
              showIconStart
              iconStart={LinkSquare02Icon}
              className="w-full"
              onClick={onOpenInPhotoshop}
            />
            <Button
              variant="ghost"
              size="xs"
              label="Edit details"
              className="w-full"
              onClick={onEditDetails}
            />
          </HoverActions>
        )}

        {interactive && variant === 'pending-review' && (
          <HoverActions>
            <Button size="sm" label="Look it over" className="w-full" onClick={onLookItOver} />
          </HoverActions>
        )}

        {interactive && variant === 'trash' && (
          <HoverActions>
            <Button
              size="sm"
              label="Restore"
              showIconStart
              iconStart={UndoIcon}
              className="w-full"
              onClick={onRestore}
            />
            <Button
              variant="ghost"
              size="xs"
              label="Delete for good"
              className="w-full"
              onClick={onDeleteForever}
            />
          </HoverActions>
        )}

        {interactive && compact && (
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 flex justify-end gap-1.5 p-2',
              REVEAL_ON_HOVER
            )}
            {...keepToControl}
          >
            <button
              type="button"
              aria-label="Open in Photoshop"
              onClick={onOpenInPhotoshop}
              className={OVERLAY_ICON_BUTTON}
            >
              <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Preview"
              onClick={onPreview}
              className={OVERLAY_ICON_BUTTON}
            >
              <HugeiconsIcon icon={ZoomInAreaIcon} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {state === 'group-target' && (
          <>
            <div aria-hidden className="absolute inset-0 rounded-xl bg-selection" />
            <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 type-label-xs-medium whitespace-nowrap text-on-primary">
              <HugeiconsIcon icon={Layers01Icon} strokeWidth={1.5} className="size-3.5" />
              {dropHint}
            </div>
          </>
        )}
      </div>

      <div className={cn('flex flex-col gap-0.5 overflow-clip px-1', leftBehind && 'opacity-0')}>
        {loading ? (
          <>
            <div className="flex h-5 items-center">
              <Skeleton className="h-3 w-34 rounded-full" />
            </div>
            <div className="flex h-4 items-center">
              <Skeleton className="h-2.5 w-24 rounded-full" />
            </div>
          </>
        ) : (
          <>
            <p className="truncate type-body-sm-medium text-foreground">{title}</p>
            {showTags && (
              <p className="truncate type-caption-xs-regular text-tertiary">{tagLine}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Full-width actions along the cover's bottom, over a soft scrim. Hover or keyboard focus reveals them. */
function HoverActions({ children }: { children: ReactNode }) {
  return (
    <div className={cn('absolute inset-x-0 bottom-0', REVEAL_ON_HOVER)} {...keepToControl}>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-22 bg-linear-to-b from-transparent to-black/60"
      />
      <div className="relative flex flex-col gap-1 p-2">{children}</div>
    </div>
  )
}
