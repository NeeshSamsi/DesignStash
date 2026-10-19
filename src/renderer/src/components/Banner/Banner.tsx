import {
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  MultiplicationSignCircleIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { BANNER_DEFAULTS, type BannerContractProps, type BannerTone } from './Banner.types'
import { bannerIconVariants, bannerVariants } from './Banner.variants'

export interface BannerProps extends BannerContractProps {
  /** Label of the action button. The button shows when `action` is on and a label is given. */
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
  className?: string
}

const ICONS = {
  info: InformationCircleIcon,
  warning: Alert02Icon,
  error: MultiplicationSignCircleIcon,
  success: CheckmarkCircle02Icon
} as const satisfies Record<BannerTone, unknown>

/**
 * Banner — Persistent inline message at the top of a view.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-777
 * Neutral card with a 3px left accent in the tone colour; errors are announced, the rest are polite.
 */
export function Banner({ className, actionLabel, onAction, onDismiss, ...rest }: BannerProps) {
  const props = { ...BANNER_DEFAULTS, ...rest }
  return (
    <div
      data-ds="Banner"
      data-tone={props.tone}
      role={props.tone === 'error' ? 'alert' : 'status'}
      className={cn(bannerVariants({ tone: props.tone }), className)}
    >
      <HugeiconsIcon
        icon={ICONS[props.tone]}
        strokeWidth={2}
        className={bannerIconVariants({ tone: props.tone })}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-body-sm-medium text-foreground">{props.title}</p>
        <p className="type-caption-xs-regular text-muted-foreground">{props.message}</p>
      </div>
      {props.action && actionLabel && (
        <Button variant="secondary" size="xs" type="button" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {props.dismissible && (
        <Button variant="ghost" size="icon-xs" type="button" aria-label="Dismiss" onClick={onDismiss}>
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      )}
    </div>
  )
}
