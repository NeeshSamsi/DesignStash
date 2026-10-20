import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, Download04Icon, Globe02Icon, HardDriveIcon } from '@hugeicons/core-free-icons'
import { Button } from '@renderer/components/Button'
import { Progress } from '@renderer/components/Progress'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/ui/badge'
import { MODEL_CARD_DEFAULTS, type ModelCardContractProps } from './ModelCard.types'
import { modelCardStepVariants, modelCardVariants } from './ModelCard.variants'

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
  onUse?: () => void
  onDownload?: () => void
  onCancel?: () => void
  onRetry?: () => void
  onDelete?: () => void
}

const FAILURE = 'The download stopped. Check your connection, then try again.'

/** Five 12×4 steps; the first `value` are filled. */
function Bar({ label, value, accent }: { label: string; value: number; accent: boolean }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)))
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-11 text-right type-caption-xs-regular text-tertiary">{label}</span>
      <div role="img" aria-label={`${label} ${filled} of 5`} className="flex items-start gap-0.5">
        {[0, 1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={modelCardStepVariants({
              filled: step >= filled ? 'none' : accent ? 'accent' : 'muted'
            })}
          />
        ))}
      </div>
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
  onUse,
  onDownload,
  onCancel,
  onRetry,
  onDelete,
  ...rest
}: ModelCardProps) {
  const { state, bestFit, name, description, languages, size, ...props } = {
    ...MODEL_CARD_DEFAULTS,
    ...rest
  }
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
          <Bar label="quality" value={quality} accent={inUse} />
          <Bar label="speed" value={speed} accent={inUse} />
        </div>
      </div>

      <div className="w-full border-t border-subtle" aria-hidden />

      <div className="flex min-h-8 items-center gap-4">
        {info && (
          <>
            <div className="flex items-center gap-1.5 type-caption-xs-regular text-tertiary">
              <HugeiconsIcon icon={Globe02Icon} strokeWidth={1.5} className="size-3.5" />
              {languages}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5 type-caption-xs-regular text-tertiary">
              <HugeiconsIcon
                icon={state === 'available' ? Download04Icon : HardDriveIcon}
                strokeWidth={1.5}
                className="size-3.5"
              />
              {size}
            </div>
          </>
        )}

        {(inUse || state === 'downloaded') && (
          <Button variant="secondary" size="sm" label="Delete" onClick={onDelete} />
        )}
        {state === 'downloaded' && (
          <Button variant="secondary" size="sm" label="Use this model" onClick={onUse} />
        )}

        {state === 'downloading' && (
          <>
            <Progress
              size="sm"
              showLabel={false}
              label={`Downloading ${name}`}
              percent={percent}
              className="min-w-0 flex-1"
            />
            <p role="status" className="type-caption-xs-regular text-muted-foreground">
              {progress}
            </p>
            <Button variant="secondary" size="sm" label="Cancel" onClick={onCancel} />
          </>
        )}

        {state === 'available' && (
          <Button
            variant="secondary"
            size="sm"
            label="Download"
            showIconStart
            iconStart={Download04Icon}
            onClick={onDownload}
          />
        )}

        {state === 'failed' && (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 type-caption-xs-regular text-error">
              <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.5} className="size-3.5 shrink-0" />
              <span role="alert">{failureReason}</span>
            </div>
            <Button variant="secondary" size="sm" label="Try again" onClick={onRetry} />
          </>
        )}
      </div>
    </div>
  )
}
