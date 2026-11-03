import { ICON_STROKE } from '@renderer/design-system/icon'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, Download04Icon, HardDriveIcon } from '@hugeicons/core-free-icons'
import type { AiDownloadProgress, AiMeaningInfo } from '@shared/ipc/ai'
import { Button } from '../../components/Button'
import { Progress } from '../../components/Progress'
import { modelPhase } from '../onboarding/model-phase'
import { downloadFailureCopy, downloadRate, downloadRemaining, formatBytes } from './settings-copy'

export interface MeaningSearchRowProps {
  meaning: AiMeaningInfo
  event: AiDownloadProgress | null
  onDownload: () => void
  onCancel: () => void
  onDelete: () => void
}

/**
 * Settings › AI model › Meaning search. The model card's states and footer (Download or Resume,
 * progress with Cancel, Try again, Delete), without the quality and speed bars or a "Use" button:
 * it is not a vision model, and it is on whenever it is downloaded.
 */
export function MeaningSearchRow({
  meaning,
  event,
  onDownload,
  onCancel,
  onDelete
}: MeaningSearchRowProps) {
  const status = modelPhase(meaning, event)
  const working = status.phase === 'downloading' || status.phase === 'verifying'
  const progress = [
    `Downloading ${status.percent}%`,
    downloadRate(status.bytesPerSecond),
    downloadRemaining(status.secondsLeft)
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      data-testid="meaning-search-row"
      data-state={working ? 'downloading' : status.phase}
      className="flex w-full flex-col gap-3 rounded-xl border border-subtle px-4 py-3"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="type-body-sm-medium text-foreground">{meaning.name}</p>
        <p className="type-body-sm-regular text-muted-foreground">
          {meaning.description} Without it, search matches words only.
        </p>
      </div>

      <div className="w-full border-t border-subtle" aria-hidden />

      <div className="flex min-h-8 items-center gap-4">
        {!working && status.phase !== 'failed' && (
          <>
            <div className="flex-1 type-caption-xs-regular text-tertiary">
              {status.phase === 'paused'
                ? `${formatBytes(status.receivedBytes)} of ${formatBytes(status.totalBytes)} downloaded`
                : status.phase === 'installed'
                  ? 'Ready. Searches add the closest match by meaning.'
                  : 'Not downloaded'}
            </div>
            <div className="flex items-center gap-1.5 type-caption-xs-regular text-tertiary">
              <HugeiconsIcon
                icon={status.phase === 'installed' ? HardDriveIcon : Download04Icon}
                strokeWidth={ICON_STROKE}
                className="size-icon-xs"
              />
              {formatBytes(meaning.sizeBytes)}
            </div>
          </>
        )}

        {status.phase === 'installed' && (
          <Button
            variant="secondary"
            size="sm"
            label="Delete"
            className="text-error"
            onClick={onDelete}
          />
        )}

        {working && (
          <>
            <Progress
              size="sm"
              showLabel={false}
              label={
                status.phase === 'verifying'
                  ? `Checking ${meaning.name}`
                  : `Downloading ${meaning.name}`
              }
              percent={status.percent}
              {...(status.phase === 'verifying' ? { state: 'indeterminate' as const } : {})}
              className="min-w-0 flex-1"
            />
            <p role="status" className="type-caption-xs-regular text-muted-foreground">
              {status.phase === 'verifying' ? 'Checking the download…' : progress}
            </p>
            {status.phase === 'downloading' && (
              <Button variant="secondary" size="sm" label="Cancel" onClick={onCancel} />
            )}
          </>
        )}

        {(status.phase === 'not-installed' || status.phase === 'paused') && (
          <Button
            variant="secondary"
            size="sm"
            label={status.phase === 'paused' ? 'Resume' : 'Download'}
            showIconStart
            iconStart={Download04Icon}
            onClick={onDownload}
          />
        )}

        {status.phase === 'failed' && (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 type-caption-xs-regular text-error">
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={ICON_STROKE}
                className="size-icon-xs shrink-0"
              />
              <span role="alert">{downloadFailureCopy(status.reason)}</span>
            </div>
            <Button variant="secondary" size="sm" label="Try again" onClick={onDownload} />
          </>
        )}
      </div>
    </div>
  )
}
