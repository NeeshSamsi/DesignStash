import { ICON_STROKE } from '@renderer/design-system/icon'
import { useRef, useState } from 'react'
import type { ComponentProps, MouseEvent, ReactNode, SyntheticEvent } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Layers01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { Badge } from '@renderer/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/ui/tooltip'
import { Skeleton } from '@renderer/ui/skeleton'
import { Button } from '@renderer/components/Button'
import { CoverImage } from '@renderer/components/CoverImage'
import { FavouriteToggle } from '@renderer/components/FavouriteToggle'
import { MiddleTruncatedText } from '@renderer/lib/middle-truncated-text'
import { cn } from '@renderer/lib/utils'
import {
  MOCKUP_CARD_DEFAULTS,
  type MockupCardContractProps,
  type MockupCardState
} from './MockupCard.types'
import {
  mockupCardCoverVariants,
  mockupCardFaceVariants,
  mockupCardVariants,
  OVERLAY_ICON_BUTTON,
  PILE_EDGE_BACK,
  PILE_EDGE_BASE,
  PILE_EDGE_FRONT,
  REVEAL_ON_HOVER
} from './MockupCard.variants'

export interface MockupCardProps
  extends MockupCardContractProps, Omit<ComponentProps<'div'>, keyof MockupCardContractProps> {
  /** Selection id: the grid finds the card by `data-mockup-id`. Leave it off for cards that must not be selectable. */
  mockupId?: string
  /** The cover file. Without it the cover shows a placeholder. */
  coverSrc?: string
  /** Set for a pile's top: the card stacks and the badge shows how many mockups the pile holds. Default none. */
  pile?: { memberCount: number } | null
  /** The title is a file name: a long one keeps its end (the date, the number) and loses its middle. */
  titleIsFileName?: boolean
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
  onLookItOver?: () => void
  onRestore?: () => void
  onDeleteForever?: () => void
}

/**
 * Card body is selection: clicks, double-clicks and keys on the action buttons never reach it. Only the buttons
 * keep them: the scrim under the hover buttons and the gaps between controls are the card like the rest of it.
 */
const stopAtButton = (event: SyntheticEvent) => {
  if (event.target instanceof Element && event.target.closest('button')) event.stopPropagation()
}
const keepToControl = {
  onClick: stopAtButton,
  onDoubleClick: stopAtButton,
  onKeyDown: stopAtButton
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
 * MockupCard — A mockup in any grid: squircle container (radius 24, 10px padding, 14px 4:3 cover), scale and cover zoom on hover, Edit details (secondary) above Open in Photoshop (primary) over the cover. A card with variants is a pile and shows two card edges below it.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1492
 * Used by My Stash, the inboxes and Trash. The body is selection (click selects; ↵ and double-click are wired by the screen);
 * the buttons fire only their own action. Hover is CSS, so Figma's hover and focus states need no props.
 */
export function MockupCard({
  className,
  mockupId,
  coverSrc,
  pile = null,
  titleIsFileName = false,
  favourite = false,
  status,
  trashedAgo,
  onToggleFavourite,
  onMore,
  onOpenInPhotoshop,
  onEditDetails,
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
  const memberCount = pile?.memberCount ?? 0
  const stacked = memberCount > 1 && !compact && !loading && !leftBehind
  const tagLine = variant === 'trash' && trashedAgo ? `Trashed ${trashedAgo}` : tags

  return (
    <div
      data-ds="MockupCard"
      data-mockup-id={mockupId}
      data-variant={variant}
      data-state={state === 'selected' ? 'selected' : undefined}
      data-pile={stacked || undefined}
      aria-busy={loading || undefined}
      tabIndex={interactive ? 0 : undefined}
      className={cn(mockupCardVariants({ variant, pile: stacked }), className)}
      {...props}
    >
      {stacked && (
        <>
          <span aria-hidden data-pile-edge className={cn(PILE_EDGE_BASE, PILE_EDGE_BACK)} />
          <span aria-hidden data-pile-edge className={cn(PILE_EDGE_BASE, PILE_EDGE_FRONT)} />
        </>
      )}
      <div
        className={cn(
          mockupCardFaceVariants({ state }),
          stacked && 'delay-100 group-hover/card:delay-0'
        )}
      >
        <div className={mockupCardCoverVariants({ hidden: leftBehind })}>
          <CoverImage
            size="md"
            state={COVER_STATE[state]}
            {...(coverSrc ? { src: coverSrc } : {})}
            imageClassName="group-hover/card:scale-105"
            className="size-full rounded-none"
          />

          <div className="absolute top-2 left-2 flex gap-1">
            {variant === 'pending-review' && showStatus && status && (
              <Badge variant="warning">{status}</Badge>
            )}
            {showVariants && memberCount > 1 && !loading && (
              // The whole pile, top included, so a pile of three reads 3.
              <Badge
                variant="count"
                aria-label={`${memberCount} mockups in this pile`}
                className="gap-1 px-2 text-muted-foreground"
              >
                <HugeiconsIcon
                  icon={Layers01Icon}
                  strokeWidth={ICON_STROKE}
                  className="size-icon-2xs"
                />
                {memberCount}
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
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={ICON_STROKE} />
                </button>
              )}
            </div>
          )}

          {interactive && variant === 'library' && (
            <HoverActions>
              <Button
                variant="secondary"
                size="xs"
                label="Edit details"
                className="w-full"
                onClick={onEditDetails}
              />
              <Button
                size="xs"
                label="Open in Photoshop"
                className="w-full"
                onClick={onOpenInPhotoshop}
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
                variant="secondary"
                size="xs"
                label="Delete for good"
                className="w-full"
                onClick={onDeleteForever}
              />
              <Button size="xs" label="Restore" className="w-full" onClick={onRestore} />
            </HoverActions>
          )}

          {interactive && compact && (
            <HoverActions>
              <Button
                size="xs"
                label="Open in Photoshop"
                className="w-full"
                onClick={onOpenInPhotoshop}
              />
            </HoverActions>
          )}

          {state === 'group-target' && (
            <>
              <div aria-hidden className="absolute inset-0 bg-selection" />
              <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 type-label-xs-medium whitespace-nowrap text-on-primary">
                <HugeiconsIcon
                  icon={Layers01Icon}
                  strokeWidth={ICON_STROKE}
                  className="size-icon-xs"
                />
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
              <CardTitle title={title} fileName={titleIsFileName} />
              {showTags && (
                <p className="truncate type-caption-xs-regular text-tertiary">{tagLine}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** How long a hover waits before the full title shows. */
const TITLE_TOOLTIP_MS = 600

/** The card title. When it is cut off, hovering it shows the full title after the usual delay. */
function CardTitle({ title, fileName }: { title: string; fileName: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const cut = () => ref.current !== null && ref.current.scrollWidth > ref.current.clientWidth
  if (fileName) {
    return (
      <MiddleTruncatedText as="p" className="type-body-sm-medium text-foreground">
        {title}
      </MiddleTruncatedText>
    )
  }
  return (
    <Tooltip
      delayDuration={TITLE_TOOLTIP_MS}
      open={open}
      onOpenChange={(next) => setOpen(next && cut())}
    >
      <TooltipTrigger asChild>
        <p ref={ref} className="truncate type-body-sm-medium text-foreground">
          {title}
        </p>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        {title}
      </TooltipContent>
    </Tooltip>
  )
}

/** Full-width actions along the cover's bottom, over a soft scrim. Hover or keyboard focus reveals them. */
function HoverActions({ children }: { children: ReactNode }) {
  return (
    <div className={cn('absolute inset-x-0 bottom-0', REVEAL_ON_HOVER)} {...keepToControl}>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-22 bg-linear-to-b from-transparent to-scrim"
      />
      <div className="relative flex flex-col gap-1 p-2">{children}</div>
    </div>
  )
}
