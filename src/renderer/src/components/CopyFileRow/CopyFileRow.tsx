import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps } from 'react'
import {
  Alert02Icon,
  Clock01Icon,
  Copy01Icon,
  FileNotFoundIcon,
  Image01Icon,
  Tick02Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { MiddleTruncatedText } from '@renderer/lib/middle-truncated-text'
import { cn } from '@renderer/lib/utils'
import { Progress } from '@renderer/components/Progress'
import {
  COPY_FILE_ROW_DEFAULTS,
  type CopyFileRowContractProps,
  type CopyFileRowState
} from './CopyFileRow.types'
import { copyFileRowDetailVariants, copyFileRowVariants } from './CopyFileRow.variants'

export interface CopyFileRowProps
  extends
    CopyFileRowContractProps,
    Omit<ComponentProps<'div'>, keyof CopyFileRowContractProps | 'children'> {
  /** `copying`: how far along, 0 to 100. Figma's sample is 41. */
  percent?: number
  /** The line under the name. Defaults to the plain sentence for the state. */
  detail?: string
}

const DETAIL: Record<Exclude<CopyFileRowState, 'copying'>, string> = {
  queued: 'Waiting to copy',
  done: 'Copied',
  duplicate: 'Already in your stash',
  unreadable: 'Couldn’t read it. The file might be damaged.',
  'not-psd': 'Not a PSD, so we skipped it'
}

const STATUS = {
  queued: Clock01Icon,
  done: Tick02Icon,
  duplicate: Copy01Icon,
  unreadable: Alert02Icon,
  'not-psd': FileNotFoundIcon
} as const

/**
 * CopyFileRow — One file in the copy widget: progress while copying, then what happened to it.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=372-5420
 * Copy stays plain: the line says what happened to the file, never a path or a code. Callers pass
 * `detail` for the specifics ("Copied · 312 MB", "Already in your stash as “Clay iPhone 15 Pro”").
 * A copying row given a `detail`, like "Unpacking… · From Cap.zip", shows it in place of the bar.
 */
export function CopyFileRow({ className, percent = 41, detail, ...rest }: CopyFileRowProps) {
  // The contract's `detail` default is only Figma's sample line: a copying row shows a detail line
  // when the caller passes one, so the sample never applies.
  const { state, name, detail: _sample, ...props } = { ...COPY_FILE_ROW_DEFAULTS, ...rest }
  void _sample
  const copying = state === 'copying'
  return (
    <div
      data-ds="CopyFileRow"
      data-state={state}
      className={cn(copyFileRowVariants({ state }), className)}
      {...props}
    >
      <div className="flex size-8 shrink-0 items-center justify-center overflow-clip rounded-lg bg-surface-3">
        <HugeiconsIcon
          icon={Image01Icon}
          strokeWidth={ICON_STROKE}
          className="size-4 text-muted-foreground"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <MiddleTruncatedText as="p" className="w-full type-body-sm-medium text-foreground">
          {name}
        </MiddleTruncatedText>
        {copying && detail === undefined ? (
          <Progress
            size="sm"
            showLabel={false}
            percent={percent}
            label={`Copying ${name}`}
            className="w-full"
          />
        ) : (
          <p className={copyFileRowDetailVariants({ state })}>
            {detail ?? (copying ? '' : DETAIL[state])}
          </p>
        )}
      </div>
      {copying ? (
        <p className="shrink-0 type-caption-xs-regular text-tertiary">{Math.round(percent)}%</p>
      ) : (
        <HugeiconsIcon
          icon={STATUS[state]}
          strokeWidth={ICON_STROKE}
          aria-hidden
          className={cn('size-4 shrink-0', state === 'unreadable' ? 'text-error' : 'text-tertiary')}
        />
      )}
    </div>
  )
}
