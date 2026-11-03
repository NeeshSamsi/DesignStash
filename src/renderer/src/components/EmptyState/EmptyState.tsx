import { ICON_STROKE } from '@renderer/design-system/icon'
import { AddSquareIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { EMPTY_STATE_DEFAULTS, type EmptyStateContractProps } from './EmptyState.types'
import { emptyStateTileVariants, emptyStateVariants } from './EmptyState.variants'

export interface EmptyStateProps extends EmptyStateContractProps {
  /** The way forward. Shown unless null: only a state that just explains itself (nothing starred yet) leaves it out. */
  primaryLabel?: string | null
  /** Shown on the primary when it stands alone. Dropped when a secondary sits beside it. */
  primaryIcon?: IconSvgElement
  onPrimary?: () => void
  /** Shown when `secondaryAction` is on. Give it a real destination; there is no help site. */
  secondaryLabel?: string
  onSecondary?: () => void
  className?: string
}

/**
 * EmptyState — Zero-data / zero-result state with a required primary action.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-403
 * Sits at the top of its view, never vertically centred.
 */
export function EmptyState({
  className,
  primaryLabel = 'Add mockups',
  primaryIcon = AddSquareIcon,
  onPrimary,
  secondaryLabel,
  onSecondary,
  ...rest
}: EmptyStateProps) {
  const props = { ...EMPTY_STATE_DEFAULTS, ...rest }
  const isPage = props.variant === 'page'
  // Icons on every button in a group or on none: beside a secondary, the primary drops its icon.
  const withSecondary = props.secondaryAction && Boolean(secondaryLabel)
  return (
    <div
      data-ds="EmptyState"
      data-variant={props.variant}
      className={cn(emptyStateVariants({ variant: props.variant }), className)}
    >
      <div className={emptyStateTileVariants({ variant: props.variant })}>
        <HugeiconsIcon icon={props.icon} strokeWidth={ICON_STROKE} />
      </div>
      <p
        className={
          isPage ? 'type-title-lg-semibold text-foreground' : 'type-body-sm-medium text-foreground'
        }
      >
        {props.title}
      </p>
      <p className="type-body-sm-regular text-muted-foreground">{props.description}</p>
      <div className="flex items-start gap-2">
        {withSecondary && (
          <Button variant="secondary" size="sm" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        )}
        {primaryLabel !== null && (
          <Button size="sm" onClick={onPrimary}>
            {!withSecondary && <HugeiconsIcon icon={primaryIcon} strokeWidth={ICON_STROKE} />}
            {primaryLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
