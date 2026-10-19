import { Progress } from '@renderer/components/Progress'
import { DialogFrame, DialogHeading } from '@renderer/lib/dialog-shell'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { Spinner } from '@renderer/ui/spinner'
import { PROGRESS_DIALOG_DEFAULTS, type ProgressDialogContractProps } from './ProgressDialog.types'
import { progressDialogVariants } from './ProgressDialog.variants'

export interface ProgressDialogProps extends ProgressDialogContractProps {
  /** Live dialog when given; without it the dialog renders in place (catalog). */
  open?: boolean
  /** Bar fill, 0–100. */
  percent?: number
  /** Line over the bar: “Copying 1.2 GB of 3.4 GB”, “3.4 GB copied”, “Stopped at 1.2 GB”. */
  progressLabel?: string
  onCancel?: () => void
  onDone?: () => void
  onRetry?: () => void
  /** `failed` only. Also what Esc does there. */
  onClose?: () => void
  className?: string
}

const SAMPLE = {
  running: { label: 'Copying 1.2 GB of 3.4 GB', percent: 35 },
  cancelling: { label: 'Copying 1.2 GB of 3.4 GB', percent: 35 },
  done: { label: '3.4 GB copied', percent: 100 },
  failed: { label: 'Stopped at 1.2 GB', percent: 35 }
} as const
const BAR_STATE = {
  running: 'progress',
  cancelling: 'progress',
  done: 'complete',
  failed: 'error'
} as const

/**
 * ProgressDialog — Blocking long-running task with progress and cancel.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1602
 * While running or cancelling it ignores Esc and outside presses; the Cancel button is the exit.
 */
export function ProgressDialog({
  className,
  open,
  percent,
  progressLabel,
  onCancel,
  onDone,
  onRetry,
  onClose,
  ...rest
}: ProgressDialogProps) {
  const props = { ...PROGRESS_DIALOG_DEFAULTS, ...rest }
  const sample = SAMPLE[props.state]
  const fill = percent ?? sample.percent
  const busy = props.state === 'running' || props.state === 'cancelling'

  return (
    <DialogFrame
      open={open}
      dataDs="ProgressDialog"
      className={cn(progressDialogVariants({ state: props.state }), className)}
      onDismiss={props.state === 'done' ? onDone : onClose}
      blocking={busy}
    >
      <DialogHeading title={props.title} description={props.description} />
      <Progress
        className="w-full"
        state={BAR_STATE[props.state]}
        label={progressLabel ?? sample.label}
        value={`${Math.round(fill)}%`}
        percent={fill}
      />
      <div className="flex items-center justify-end gap-2">
        {props.state === 'running' && (
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {props.state === 'cancelling' && (
          <Button variant="secondary" size="sm" disabled aria-busy>
            <Spinner size="sm" aria-hidden />
            Cancelling…
          </Button>
        )}
        {props.state === 'done' && (
          <Button size="sm" onClick={onDone}>
            Done
          </Button>
        )}
        {props.state === 'failed' && (
          <>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
          </>
        )}
      </div>
    </DialogFrame>
  )
}
