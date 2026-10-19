import { cn } from '@renderer/lib/utils'
import { Progress as UiProgress } from '@renderer/ui/progress'
import { PROGRESS_DEFAULTS, type ProgressContractProps } from './Progress.types'
import { progressVariants } from './Progress.variants'

export interface ProgressProps extends ProgressContractProps {
  /** Indicator fill, 0–100. Defaults to the number in `value` ("30%" → 30). */
  percent?: number
  className?: string
}

const UI_SIZE = { sm: 'sm', base: 'default' } as const

/**
 * Progress — Determinate / indeterminate bar. Indicator width = value in code.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-176
 * Label row over ui/progress.tsx (Figma `base` → shadcn `default`). Width defaults to Figma's
 * 320; pass `w-full` to fill the parent.
 */
export function Progress({ className, percent, ...rest }: ProgressProps) {
  const props = { ...PROGRESS_DEFAULTS, ...rest }
  const fill = percent ?? (Number.parseFloat(props.value) || 0)
  return (
    <div
      data-ds="Progress"
      data-state={props.state}
      className={cn(progressVariants({ size: props.size, state: props.state }), className)}
    >
      {props.showLabel && (
        <div className="flex justify-between gap-2 type-caption-xs-regular">
          <span
            className={cn(
              'min-w-0 truncate',
              props.state === 'error' ? 'text-error' : 'text-muted-foreground'
            )}
          >
            {props.label}
          </span>
          <span className="shrink-0 text-tertiary">{props.value}</span>
        </div>
      )}
      <UiProgress
        size={UI_SIZE[props.size]}
        state={props.state}
        value={fill}
        aria-label={props.label}
      />
    </div>
  )
}
