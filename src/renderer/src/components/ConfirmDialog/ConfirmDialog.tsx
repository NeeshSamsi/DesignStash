import { ICON_STROKE } from '@renderer/design-system/icon'
import { Layers01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { DialogCancel, DialogFrame, DialogHeading } from '@renderer/lib/dialog-shell'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/Button'
import { Spinner } from '@renderer/components/Spinner'
import { CONFIRM_DIALOG_DEFAULTS, type ConfirmDialogContractProps } from './ConfirmDialog.types'
import { confirmDialogVariants } from './ConfirmDialog.variants'

export interface ConfirmDialogProps extends ConfirmDialogContractProps {
  /** Live alert dialog when given; without it the panel renders in place (catalog). */
  open?: boolean
  onConfirm?: () => void
  /** Cancel button, Esc and outside press. Ignored while `working`. */
  onCancel?: () => void
  /** Names the consequence: “Disband pile”, “Delete for good”, “Discard”. */
  confirmLabel?: string
  /** “Cancel”, or “Keep editing” for unsaved changes. */
  cancelLabel?: string
  /** Shown on the confirm button while `working`. */
  workingLabel?: string
  detailIcon?: IconSvgElement
  className?: string
}

const CONFIRM = { neutral: 'Disband pile', destructive: 'Delete for good' } as const
const WORKING = { neutral: 'Disbanding…', destructive: 'Deleting…' } as const

/**
 * ConfirmDialog — Two-choice confirmation that names the consequence (item, count, size).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1010
 * Exactly one filled button: the primary, red when `destructive`. Cancel is focused first, so
 * Enter never confirms a destructive action unless the person has moved focus to it.
 * Unsaved changes in Detail: destructive, cancelLabel "Keep editing", confirmLabel "Discard", no Save.
 */
export function ConfirmDialog({
  className,
  open,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel = 'Cancel',
  workingLabel,
  detailIcon = Layers01Icon,
  ...rest
}: ConfirmDialogProps) {
  const props = { ...CONFIRM_DIALOG_DEFAULTS, ...rest }
  const isLive = open !== undefined
  const destructive = props.variant === 'destructive'

  const cancel = isLive ? (
    <DialogCancel>
      <Button variant="secondary" size="sm" disabled={props.working}>
        {cancelLabel}
      </Button>
    </DialogCancel>
  ) : (
    <Button variant="secondary" size="sm" disabled={props.working} onClick={onCancel}>
      {cancelLabel}
    </Button>
  )

  return (
    <DialogFrame
      open={open}
      alert
      dataDs="ConfirmDialog"
      className={cn(
        confirmDialogVariants({ variant: props.variant, working: props.working }),
        className
      )}
      onDismiss={onCancel}
      blocking={props.working}
    >
      <DialogHeading title={props.title} description={props.description} />
      {props.detail && (
        <div className="flex items-center gap-3 rounded-lg bg-surface-3 px-3 py-2.5">
          <HugeiconsIcon
            icon={detailIcon}
            strokeWidth={ICON_STROKE}
            className="size-5 shrink-0 text-tertiary"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p title={props.detailTitle} className="type-body-sm-medium truncate text-foreground">
              {props.detailTitle}
            </p>
            <p className="type-caption-xs-regular text-tertiary">{props.detailMeta}</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        {cancel}
        <Button
          variant={destructive ? 'destructive' : 'primary'}
          size="sm"
          aria-busy={props.working || undefined}
          disabled={props.working}
          onClick={onConfirm}
        >
          {props.working ? (
            <>
              <Spinner size="sm" aria-hidden />
              {workingLabel ?? WORKING[props.variant]}
            </>
          ) : (
            (confirmLabel ?? CONFIRM[props.variant])
          )}
        </Button>
      </div>
    </DialogFrame>
  )
}
