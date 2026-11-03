import { useId } from 'react'
import type { AiDownloadProgress, AiMeaningInfo } from '@shared/ipc/ai'
import { Switch } from '@renderer/components/Switch'
import { Tooltip } from '@renderer/components/Tooltip'
import { Badge } from '@renderer/ui/badge'
import { meaningLine, meaningStarted } from '../settings/settings-copy'
import { modelPhase } from './model-phase'

/** Why the switch can't be changed once meaning search has started downloading (or is there). */
export const MEANING_LOCKED_REASON = 'Already chosen. Change it in Settings › AI model.'

export interface MeaningSearchCardProps {
  meaning: AiMeaningInfo
  event: AiDownloadProgress | null
  on: boolean
  onChange: (on: boolean) => void
}

/**
 * A3 · AI setup, under the AI panel: meaning search as its own choice (D6 M2). Its switch is on by
 * default; once its download has started, Settings › AI model handles it.
 */
export function MeaningSearchCard({ meaning, event, on, onChange }: MeaningSearchCardProps) {
  const titleId = useId()
  const statusId = useId()
  const locked = meaningStarted(meaning, event)
  const installed = modelPhase(meaning, event).phase === 'installed'

  const toggle = (
    <Switch
      showLabel={false}
      checked={on || locked}
      disabled={locked}
      onCheckedChange={onChange}
      aria-label="Download meaning search"
      aria-describedby={statusId}
    />
  )

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="flex w-full items-center gap-4 rounded-xl border border-base p-4"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <p id={titleId} className="type-body-sm-medium whitespace-nowrap text-foreground">
            Meaning search
          </p>
          {!installed && <Badge>Recommended</Badge>}
        </div>
        <p className="type-caption-xs-regular text-muted-foreground">
          Finds mockups by what you mean, like “jumper” for a sweatshirt. Without it, search matches
          the words you type.
        </p>
        <p id={statusId} role="status" className="type-caption-xs-regular text-tertiary">
          {meaningLine(meaning, event, on)}
        </p>
      </div>
      {locked ? (
        <Tooltip label={MEANING_LOCKED_REASON} arrow="bottom-right">
          <span tabIndex={0} className="inline-flex">
            {toggle}
          </span>
        </Tooltip>
      ) : (
        toggle
      )}
    </div>
  )
}
