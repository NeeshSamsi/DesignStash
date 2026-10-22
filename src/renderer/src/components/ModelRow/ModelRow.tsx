import type { ComponentProps, MouseEvent } from 'react'
import { PauseCircleIcon, PlayCircleIcon } from '@hugeicons/core-free-icons'
import { Badge } from '@renderer/ui/badge'
import { Button } from '@renderer/components/Button'
import { Spinner } from '@renderer/components/Spinner'
import { cn } from '@renderer/lib/utils'
import { Progress as UiProgress } from '@renderer/ui/progress'
import { MODEL_ROW_DEFAULTS, type ModelRowContractProps } from './ModelRow.types'
import { modelRowRadioVariants, modelRowVariants } from './ModelRow.variants'

export interface ModelRowProps
  extends
    ModelRowContractProps,
    Omit<ComponentProps<'div'>, keyof ModelRowContractProps | 'children' | 'onSelect'> {
  /** "Qwen 2.5 VL 3B". */
  name?: string
  /** One plain line: "2.8 GB · medium · better titles and tags". */
  detail?: string
  /** The Recommended tag next to the name (only while it isn't installed). */
  recommended?: boolean
  /** `installed`: the tag next to the name. "Built in" for a model that comes with macOS. */
  installedLabel?: string
  /** The chosen row in the radio list. Defaults to every state except `installed`, as in Figma. */
  selected?: boolean
  /** `downloading` and `paused`: how far along, 0 to 100. Figma's sample is 41. */
  percent?: number
  /** `downloading` and `paused`: "860 MB of 2.8 GB · about 2 min left". */
  progressText?: string
  /** `verifying`: the line over the bar. */
  verifyingText?: string
  /** `failed`: why it stopped, in plain words. */
  failureReason?: string
  onSelect?: () => void
  onPause?: () => void
  onResume?: () => void
  onRetry?: () => void
}

const stop = (event: MouseEvent) => event.stopPropagation()

/**
 * ModelRow — One on-device model in the onboarding picker (a radio list): download, pause or resume, verify, installed, failed.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-4073
 * Settings › AI model uses ModelCard instead. The radio is the control; clicking the row picks it
 * too, and the inline buttons never change the pick.
 */
export function ModelRow({
  className,
  name = 'Qwen 2.5 VL 3B',
  detail = '2.8 GB · medium · better titles and tags',
  recommended = false,
  installedLabel = 'Downloaded',
  selected,
  percent = 41,
  progressText = '860 MB of 2.8 GB · about 2 min left',
  verifyingText = 'Checking the download…',
  failureReason = 'The download stopped. Check your connection, then try again.',
  onSelect,
  onPause,
  onResume,
  onRetry,
  ...rest
}: ModelRowProps) {
  // `selected` is the flag's Figma default (off); unset means "the chosen row", so it is not used here.
  const { state, selected: figmaDefault, ...props } = { ...MODEL_ROW_DEFAULTS, ...rest }
  void figmaDefault
  const chosen = selected ?? state !== 'installed'
  const transfer = state === 'downloading' || state === 'paused'
  return (
    <div
      data-ds="ModelRow"
      data-state={state}
      onClick={onSelect}
      className={cn(modelRowVariants({ state, selected: chosen }), className)}
      {...props}
    >
      <button
        type="button"
        role="radio"
        aria-checked={chosen}
        aria-label={name}
        onClick={(event) => {
          stop(event)
          onSelect?.()
        }}
        className={modelRowRadioVariants({ selected: chosen })}
      >
        {chosen && <span className="size-2 rounded-full bg-primary" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="type-body-sm-medium whitespace-nowrap text-foreground">{name}</p>
          {state === 'not-installed' && recommended && <Badge>Recommended</Badge>}
          {state === 'installed' && <Badge variant="secondary">{installedLabel}</Badge>}
        </div>

        {(state === 'not-installed' || state === 'installed') && (
          <p className="type-caption-xs-regular text-tertiary">{detail}</p>
        )}
        {state === 'failed' && (
          <p role="alert" className="type-caption-xs-regular text-error">
            {failureReason}
          </p>
        )}
        {transfer && (
          <div className="flex w-full items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2 type-caption-xs-regular">
                <p className="min-w-0 flex-1 truncate text-muted-foreground">
                  {state === 'paused' ? `Paused · ${progressText.split(' · ')[0]}` : progressText}
                </p>
                <p className="shrink-0 text-tertiary">{Math.round(percent)}%</p>
              </div>
              <UiProgress size="sm" value={percent} aria-label={`Downloading ${name}`} />
            </div>
            {state === 'downloading' ? (
              <Button
                variant="ghost"
                size="icon"
                iconStart={PauseCircleIcon}
                aria-label={`Pause ${name}`}
                onClick={(event) => {
                  stop(event)
                  onPause?.()
                }}
              />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                iconStart={PlayCircleIcon}
                aria-label={`Resume ${name}`}
                onClick={(event) => {
                  stop(event)
                  onResume?.()
                }}
              />
            )}
          </div>
        )}
        {state === 'verifying' && (
          <div className="flex w-full flex-col gap-1.5">
            <p role="status" className="type-caption-xs-regular text-muted-foreground">
              {verifyingText}
            </p>
            <UiProgress size="sm" state="indeterminate" aria-label={verifyingText} />
          </div>
        )}
      </div>

      {state === 'verifying' && <Spinner size="sm" />}
      {state === 'failed' && (
        <Button
          variant="secondary"
          size="xs"
          label="Retry"
          onClick={(event) => {
            stop(event)
            onRetry?.()
          }}
        />
      )}
    </div>
  )
}
