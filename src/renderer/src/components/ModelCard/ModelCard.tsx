import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, Download04Icon, Globe02Icon, HardDriveIcon } from '@hugeicons/core-free-icons'
import { Button } from '@renderer/components/Button'
import { Progress } from '@renderer/components/Progress'
import { StepBar, type StepBarValue } from '@renderer/components/StepBar'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/ui/badge'
import { MODEL_CARD_DEFAULTS, type ModelCardContractProps } from './ModelCard.types'
import { modelCardVariants } from './ModelCard.variants'

export interface ModelCardProps
  extends
    ModelCardContractProps,
    Omit<ComponentProps<'div'>, keyof ModelCardContractProps | 'children'> {
  /** Quality out of 5 steps. Default 4. */
  quality?: number
  /** Speed out of 5 steps. Default 3. */
  speed?: number
  /** `downloading`: how far along, 0 to 100. Figma's sample is 42. */
  percent?: number
  /** `downloading`: the current speed, "18 MB/s". Left out of the line when empty. */
  rate?: string
  /** `downloading`: time left, "about 3 min left". Left out of the line when empty. */
  remaining?: string
  /** `failed`: why it stopped, in plain words. */
  failureReason?: string
  /** `downloading`: the file is whole and being checked, so there is nothing to cancel. */
  verifying?: boolean
  /** `available`: a stopped download is on disk. Replaces the languages and turns Download into Resume. */
  resumeNote?: string
  /** Use this model is off, with the reason as its tooltip (AI is switched off). */
  useDisabled?: boolean
  /** False for a model that comes with macOS: there is nothing to delete, so no Delete button. */
  deletable?: boolean
  downloadDisabled?: boolean
  onUse?: () => void
  onDownload?: () => void
  onCancel?: () => void
  onRetry?: () => void
  onDelete?: () => void
}

const FAILURE = 'The download stopped. Check your connection, then try again.'

/** A label and a StepBar: the first `value` of five steps filled in the brand colour, on every card. */
function Bar({ label, value }: { label: string; value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)))
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-11 text-right type-caption-xs-regular text-tertiary">{label}</span>
      <StepBar
        value={String(filled) as StepBarValue}
        role="img"
        aria-label={`${label} ${filled} of 5`}
      />
    </div>
  )
}

/**
 * ModelCard — One on-device model in Settings › AI model, after Handy's model card.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=795-9758
 * Name, an In use or Best fit tag and one plain line; quality and speed as five-step bars; a divider;
 * then languages, size and the action. Actions are buttons, never the whole card: Use this model,
 * Download, Cancel, Try again, Delete. States: in-use · downloaded · downloading · available · failed.
 */
export function ModelCard({
  className,
  quality = 4,
  speed = 3,
  percent = 42,
  rate = '18 MB/s',
  remaining = 'about 3 min left',
  failureReason = FAILURE,
  verifying = false,
  resumeNote,
  useDisabled = false,
  deletable = true,
  downloadDisabled = false,
  onUse,
  onDownload,
  onCancel,
  onRetry,
  onDelete,
  ...rest
}: ModelCardProps) {
  const {
    state: figmaState,
    bestFit,
    name,
    description,
    languages,
    size,
    resumeNote: figmaResumeNote,
    qualityBar,
    speedBar,
    ...props
  } = {
    ...MODEL_CARD_DEFAULTS,
    ...rest
  }
  // Figma draws verifying and paused as states of their own; in code they are a downloading card
  // that is being checked, and an available card that has a partial download to resume.
  const state =
    figmaState === 'verifying' ? 'downloading' : figmaState === 'paused' ? 'available' : figmaState
  const isVerifying = verifying || figmaState === 'verifying'
  const note = resumeNote ?? (figmaState === 'paused' ? figmaResumeNote : undefined)
  const inUse = state === 'in-use'
  const info = state === 'in-use' || state === 'downloaded' || state === 'available'
  const progress = [`Downloading ${Math.round(percent)}%`, rate, remaining]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      data-ds="ModelCard"
      data-state={state}
      className={cn(modelCardVariants({ state }), className)}
      {...props}
    >
      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <p className="type-body-sm-medium text-foreground">{name}</p>
            {inUse && <Badge variant="success">In use</Badge>}
            {bestFit && <Badge variant="secondary">Best fit for this Mac</Badge>}
          </div>
          <p className="type-body-sm-regular text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {qualityBar ?? <Bar label="quality" value={quality} />}
          {speedBar ?? <Bar label="speed" value={speed} />}
        </div>
      </div>

      <div className="w-full border-t border-subtle" aria-hidden />

      <div className="flex min-h-8 items-center gap-4">
        {info && (
          <>
            <div className="flex items-center gap-1.5 type-caption-xs-regular text-tertiary">
              <HugeiconsIcon
                icon={Globe02Icon}
                strokeWidth={ICON_STROKE}
                className="size-icon-xs"
              />
              {note ?? languages}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5 type-caption-xs-regular text-tertiary">
              <HugeiconsIcon
                icon={state === 'available' ? Download04Icon : HardDriveIcon}
                strokeWidth={ICON_STROKE}
                className="size-icon-xs"
              />
              {size}
            </div>
          </>
        )}

        {deletable && (inUse || state === 'downloaded') && (
          <Button
            variant="secondary"
            size="sm"
            label="Delete"
            className="text-error"
            onClick={onDelete}
          />
        )}
        {state === 'downloaded' && (
          <Button
            variant="secondary"
            size="sm"
            label="Use this model"
            disabled={useDisabled}
            onClick={onUse}
          />
        )}

        {state === 'downloading' && (
          <>
            <Progress
              size="sm"
              showLabel={false}
              label={isVerifying ? `Checking ${name}` : `Downloading ${name}`}
              percent={percent}
              {...(isVerifying ? { state: 'indeterminate' as const } : {})}
              className="min-w-0 flex-1"
            />
            <p role="status" className="type-caption-xs-regular text-muted-foreground">
              {isVerifying ? 'Checking the download…' : progress}
            </p>
            {!isVerifying && (
              <Button variant="secondary" size="sm" label="Cancel" onClick={onCancel} />
            )}
          </>
        )}

        {state === 'available' && (
          <Button
            variant="secondary"
            size="sm"
            label={note ? 'Resume' : 'Download'}
            showIconStart
            iconStart={Download04Icon}
            disabled={downloadDisabled}
            onClick={onDownload}
          />
        )}

        {state === 'failed' && (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 type-caption-xs-regular text-error">
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={ICON_STROKE}
                className="size-icon-xs shrink-0"
              />
              <span role="alert">{failureReason}</span>
            </div>
            <Button variant="secondary" size="sm" label="Try again" onClick={onRetry} />
          </>
        )}
      </div>
    </div>
  )
}
