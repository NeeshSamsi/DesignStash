import {
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { TOAST_DEFAULTS, type ToastContractProps, type ToastVariant } from './Toast.types'
import { toastIconVariants, toastVariants } from './Toast.variants'

export interface ToastProps extends ToastContractProps {
  /** Action button label. Defaults to Retry on `error`, otherwise Undo. */
  actionLabel?: string
  onAction?: () => void
  onClose?: () => void
  className?: string
}

const ICONS = {
  neutral: InformationCircleIcon,
  info: InformationCircleIcon,
  success: CheckmarkCircle02Icon,
  error: Alert02Icon
} as const satisfies Record<ToastVariant, unknown>

/**
 * Toast — Transient confirmation with optional action (Undo / Open / Retry). Lives in ActivityDock.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-905
 * Presentational body; stores/toastStore.ts mounts it through Sonner (ui/sonner.tsx).
 */
export function Toast({ className, actionLabel, onAction, onClose, ...rest }: ToastProps) {
  const props = { ...TOAST_DEFAULTS, ...rest }
  return (
    <div
      data-ds="Toast"
      data-variant={props.variant}
      role={props.variant === 'error' ? 'alert' : 'status'}
      className={cn(toastVariants({ variant: props.variant }), className)}
    >
      {props.showIcon && (
        <HugeiconsIcon
          icon={ICONS[props.variant]}
          strokeWidth={2}
          className={toastIconVariants({ variant: props.variant })}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-body-sm-medium text-foreground">{props.message}</p>
        {props.showDescription && (
          <p className="type-caption-xs-regular text-muted-foreground">{props.description}</p>
        )}
      </div>
      {props.action && (
        <Button variant="ghost" size="xs" onClick={onAction}>
          {actionLabel ?? (props.variant === 'error' ? 'Retry' : 'Undo')}
        </Button>
      )}
      <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onClose}>
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </div>
  )
}
