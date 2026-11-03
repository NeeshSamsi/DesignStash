import { useId, type ComponentProps } from 'react'
import { Switch } from '@renderer/components/Switch'
import { Tooltip } from '@renderer/components/Tooltip'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/components/Badge'
import {
  MEANING_SEARCH_CARD_DEFAULTS,
  type MeaningSearchCardContractProps,
  type MeaningSearchCardState
} from './MeaningSearchCard.types'
import { meaningSearchCardVariants } from './MeaningSearchCard.variants'

/** Why the switch can't be changed once meaning search has started downloading (or is there). */
export const MEANING_LOCKED_REASON = 'Already chosen. Change it in Settings › AI model.'

/** Figma's status line for each state. Screens pass the real one (meaningLine in settings-copy.ts). */
const SAMPLE_STATUS: Record<MeaningSearchCardState, string> = {
  on: '146 MB',
  off: 'Off · search matches the words you type',
  downloading: 'Downloading 37%',
  checking: 'Checking the download',
  ready: 'Ready',
  failed: 'Couldn’t download. Try again in Settings › AI model.'
}

const UNLOCKED: readonly MeaningSearchCardState[] = ['on', 'off']

export interface MeaningSearchCardProps
  extends
    MeaningSearchCardContractProps,
    Omit<ComponentProps<'div'>, keyof MeaningSearchCardContractProps | 'children'> {
  /** The line under the description: the size, the download's progress, or what went wrong. */
  status?: string
  /** The switch, while the state is `on` or `off`. */
  onCheckedChange?: (on: boolean) => void
}

/**
 * MeaningSearchCard — Meaning search in onboarding’s AI step (D6 option M2): its own card under the
 * AI panel, shown whether or not on-device AI is on. The switch is on by default; once the download
 * has started it stays on and disabled, with the reason in a tooltip, and Settings › AI model
 * handles it from there.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=1000-6352
 */
export function MeaningSearchCard({
  className,
  status,
  onCheckedChange,
  ...rest
}: MeaningSearchCardProps) {
  const { state, ...div } = { ...MEANING_SEARCH_CARD_DEFAULTS, ...rest }
  const titleId = useId()
  const statusId = useId()
  const locked = !UNLOCKED.includes(state)

  const toggle = (
    <Switch
      showLabel={false}
      checked={state !== 'off'}
      disabled={locked}
      {...(onCheckedChange && { onCheckedChange })}
      aria-label="Download meaning search"
      aria-describedby={statusId}
    />
  )

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      data-ds="MeaningSearchCard"
      data-state={state}
      className={cn(meaningSearchCardVariants({ state }), className)}
      {...div}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <p id={titleId} className="type-body-sm-medium whitespace-nowrap text-foreground">
            Meaning search
          </p>
          {state !== 'ready' && <Badge>Recommended</Badge>}
        </div>
        <p className="type-caption-xs-regular text-muted-foreground">
          Finds mockups by what you mean, like “jumper” for a sweatshirt. Without it, search matches
          the words you type.
        </p>
        <p id={statusId} role="status" className="type-caption-xs-regular text-tertiary">
          {status ?? SAMPLE_STATUS[state]}
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
