import { AddSquareIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { EMPTY_STATE_DEFAULTS, type EmptyStateContractProps } from './EmptyState.types'
import { emptyStateTileVariants, emptyStateVariants } from './EmptyState.variants'

export interface EmptyStateProps extends EmptyStateContractProps {
  /** The way forward. Required: an empty state never leaves the person without a next step. */
  primaryLabel?: string
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
  return (
    <div
      data-ds="EmptyState"
      data-variant={props.variant}
      className={cn(emptyStateVariants({ variant: props.variant }), className)}
    >
      <div className={emptyStateTileVariants({ variant: props.variant })}>
        <HugeiconsIcon icon={props.icon} strokeWidth={2} />
      </div>
      <p className={isPage ? 'type-title-lg-semibold text-foreground' : 'type-body-sm-medium text-foreground'}>
        {props.title}
      </p>
      <p className="type-body-sm-regular text-muted-foreground">{props.description}</p>
      <div className="flex items-start gap-2">
        {props.secondaryAction && secondaryLabel && (
          <Button variant="secondary" size="sm" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        )}
        <Button size="sm" onClick={onPrimary}>
          <HugeiconsIcon icon={primaryIcon} strokeWidth={2} />
          {primaryLabel}
        </Button>
      </div>
    </div>
  )
}
