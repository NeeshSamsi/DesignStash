import type { ReactNode } from 'react'
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { Spinner } from '@renderer/ui/spinner'
import { LIST_ROW_DEFAULTS, type ListRowContractProps } from './ListRow.types'
import { listRowMediaVariants, listRowVariants } from './ListRow.variants'

export interface ListRowProps extends ListRowContractProps {
  /** Beside the title, e.g. a status Badge (“Stash check · In sync”). */
  titleAdornment?: ReactNode
  /** The `thumb` slot: a CoverImage sized to the media box. Falls back to the media icon. */
  thumbContent?: ReactNode
  /** Right-hand controls. Replaces the default secondary button + ⋯ when given. */
  actionsContent?: ReactNode
  /** Default secondary button. */
  actionLabel?: string
  onAction?: () => void
  /** Default ⋯ button. Hidden when not given. */
  onMore?: () => void
  className?: string
}

/**
 * ListRow — Generic row: media or thumb · title/subtitle · actions. Row actions use the standard secondary button.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-1260
 * Configs: Trash rows, skipped files, reconciliation, pending items, Settings rows (title, the real
 * value underneath, control on the right). `busy` swaps the actions for a spinner; `error` turns the
 * border and subtitle red. Hover is plain CSS.
 */
export function ListRow({
  className,
  titleAdornment,
  thumbContent,
  actionsContent,
  actionLabel = 'Restore',
  onAction,
  onMore,
  ...rest
}: ListRowProps) {
  const props = { ...LIST_ROW_DEFAULTS, ...rest }
  const mediaClass = listRowMediaVariants({ density: props.density })
  const icon = <HugeiconsIcon icon={props.mediaIcon} strokeWidth={2} className="size-4" />
  return (
    <div
      data-ds="ListRow"
      data-density={props.density}
      data-state={props.state}
      aria-busy={props.state === 'busy' || undefined}
      className={cn(listRowVariants({ density: props.density, state: props.state }), className)}
    >
      {props.media && <div className={mediaClass}>{icon}</div>}
      {props.thumb && <div className={mediaClass}>{thumbContent ?? icon}</div>}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="type-body-sm-medium truncate text-foreground">{props.title}</p>
          {titleAdornment}
        </div>
        <p
          className={cn(
            'type-caption-xs-regular truncate',
            props.state === 'error' ? 'text-error' : 'text-tertiary'
          )}
        >
          {props.subtitle}
        </p>
      </div>
      {props.actions &&
        (props.state === 'busy' ? (
          <Spinner size="sm" aria-label="Working" />
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            {actionsContent ?? (
              <>
                <Button variant="secondary" size="sm" onClick={onAction}>
                  {actionLabel}
                </Button>
                {onMore && (
                  <Button variant="ghost" size="icon" aria-label="More actions" onClick={onMore}>
                    <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
    </div>
  )
}
