import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps, MouseEvent } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { GroupMemberThumb } from '@renderer/components/GroupMemberThumb'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/ui/badge'
import { Button } from '@renderer/components/Button'
import { GROUP_CARD_DEFAULTS, type GroupCardContractProps } from './GroupCard.types'
import { GROUP_MEMBERS, groupCardHeaderVariants, groupCardVariants } from './GroupCard.variants'

export interface GroupCardProps
  extends
    GroupCardContractProps,
    Omit<ComponentProps<'div'>, keyof GroupCardContractProps | 'title'> {
  /** Selection id: the board finds the pile by `data-pile-id`. */
  pileId?: string
  /** Members in the pile, for the "N mockups" badge. Drop ghosts and left-behind slots don't count. */
  count?: number
  /** Why the pile exists when its title doesn't say: "similar names", "top mockup stashed". */
  reason?: string
  /** The ⋯ menu (same menu as right-click): Disband pile, Merge into… */
  onMore?: (event: MouseEvent<HTMLButtonElement>) => void
  /** "Merge into this pile" on a `merge-target`. */
  mergeHint?: string
}

/**
 * GroupCard — A proposed pile or the Standalone tray, as a drop zone of GroupMemberThumbs.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-3163
 * Used by the Sort board. The header band is the pile's handle: click selects the pile, drag moves it whole.
 * Title and badge rules: design/specs/pile-titles.md. No confidence badge, and no renaming in Sort.
 * Pass the tiles as `members`; without them it shows Figma's four sample tiles.
 */
export function GroupCard({
  className,
  pileId,
  count,
  reason = 'similar names',
  onMore,
  mergeHint = 'Merge into this pile',
  ...rest
}: GroupCardProps) {
  const { variant, state, showFolder, showReason, title, members, ...props } = {
    ...GROUP_CARD_DEFAULTS,
    ...rest
  }
  const standalone = variant === 'standalone'
  const empty = state === 'empty'
  const merge = state === 'merge-target'
  const total = count ?? (standalone ? (empty ? 0 : 3) : 4)
  const tiles =
    members ??
    (standalone && empty
      ? null
      : Array.from({ length: total }, (_, i) => (
          <GroupMemberThumb key={i} primary={!standalone && i === 0} />
        )))

  return (
    <div
      data-ds="GroupCard"
      data-variant={variant}
      data-state={state}
      data-pile-id={pileId}
      aria-selected={state === 'selected' || undefined}
      className={cn(groupCardVariants({ variant, state }), className)}
      {...props}
    >
      {standalone ? (
        <div className="flex items-center gap-2">
          <p className="type-body-sm-medium text-foreground">On its own</p>
          <Badge variant="count">{total}</Badge>
        </div>
      ) : (
        <div data-handle="" className={groupCardHeaderVariants({ state })}>
          {showFolder && (
            <HugeiconsIcon
              icon={Folder01Icon}
              strokeWidth={ICON_STROKE}
              className="size-4 shrink-0"
            />
          )}
          <p
            className={cn(
              'type-body-sm-medium',
              state === 'selected' ? 'text-on-primary' : 'text-foreground'
            )}
          >
            {title}
          </p>
          {merge ? (
            <Badge variant="default">{mergeHint}</Badge>
          ) : (
            <>
              <Badge variant="secondary">{total === 1 ? '1 mockup' : `${total} mockups`}</Badge>
              {showReason && <Badge variant="outline">{reason}</Badge>}
            </>
          )}
          <span className="flex-1" />
          {state !== 'selected' && onMore && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`More actions for ${title}`}
              showIconStart
              iconStart={MoreHorizontalIcon}
              onClick={onMore}
            />
          )}
          {state === 'selected' && onMore && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`More actions for ${title}`}
              showIconStart
              iconStart={MoreHorizontalIcon}
              className="text-on-primary"
              onClick={onMore}
            />
          )}
        </div>
      )}
      <div
        className={cn(
          !standalone && GROUP_MEMBERS,
          standalone &&
            'grid grid-cols-2 gap-3 @md/pile:grid-cols-3 @xl/pile:grid-cols-4 @3xl/pile:grid-cols-5 @4xl/pile:grid-cols-6'
        )}
      >
        {tiles}
      </div>
    </div>
  )
}
