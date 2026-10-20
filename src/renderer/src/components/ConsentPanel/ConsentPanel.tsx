import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Shield01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@renderer/components/Button'
import { Switch } from '@renderer/components/Switch'
import { cn } from '@renderer/lib/utils'
import { CONSENT_PANEL_DEFAULTS, type ConsentPanelContractProps } from './ConsentPanel.types'
import { consentPanelVariants } from './ConsentPanel.variants'

export interface ConsentPanelProps
  extends
    ConsentPanelContractProps,
    Omit<ComponentProps<'div'>, keyof ConsentPanelContractProps | 'title'> {
  /** `card` is onboarding's choice; `accordion` is Settings › Privacy, headed by its switch. */
  mode?: 'card' | 'accordion'
  title?: string
  description?: string
  /** What we collect, each with a green tick. Figma's list until given. */
  collect?: readonly string[]
  /** What we never collect, each with a red cross. Figma's list until given. */
  neverCollect?: readonly string[]
  /** Card: the two answers. No thanks is secondary, Keep it on is the one primary. */
  onDecline?: () => void
  onAccept?: () => void
  declineLabel?: string
  acceptLabel?: string
  /** Accordion: the switch. Off collapses the lists. */
  enabled?: boolean
  onEnabledChange?: (enabled: boolean) => void
}

const COLLECT = [
  'App and macOS version',
  'Which features are used (counts)',
  'Crash reports'
] as const
const NEVER = [
  'Your files, file names or images',
  'Titles, tags or descriptions',
  'Anything that identifies you'
] as const

function List({
  heading,
  items,
  icon,
  tone
}: {
  heading: string
  items: readonly string[]
  icon: typeof Tick02Icon
  tone: 'text-success' | 'text-error'
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="type-label-xs-medium text-tertiary">{heading}</p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <HugeiconsIcon
              icon={icon}
              strokeWidth={1.5}
              aria-hidden
              className={cn('mt-0.5 size-4 shrink-0', tone)}
            />
            <span className="type-body-sm-regular text-secondary">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * ConsentPanel — Telemetry disclosure + choice for onboarding (A4): what we collect / never collect,
 * with No thanks · Keep it on. Settings › Privacy shows the same lists in its usage-data accordion.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-4275
 * What we collect gets green ticks and What we never collect red crosses, in both modes.
 * In `accordion` mode the switch heads the container and the lists open underneath while it is on.
 */
export function ConsentPanel({
  className,
  mode = 'card',
  title,
  description,
  collect = COLLECT,
  neverCollect = NEVER,
  onDecline,
  onAccept,
  declineLabel = 'No thanks',
  acceptLabel = 'Keep it on',
  enabled = true,
  onEnabledChange,
  ...rest
}: ConsentPanelProps) {
  const props = { ...CONSENT_PANEL_DEFAULTS, ...rest }
  const accordion = mode === 'accordion'
  const heading = title ?? (accordion ? 'Share anonymous usage data' : 'Help improve DesignStash')
  const line =
    description ??
    (accordion
      ? 'Helps us squash bugs and decide what to fix next. Change your mind any time.'
      : 'Just anonymous usage data. Change your mind any time.')

  const lists = (
    <div className="flex items-start gap-6">
      <List heading="What we collect" items={collect} icon={Tick02Icon} tone="text-success" />
      <List
        heading="What we never collect"
        items={neverCollect}
        icon={Cancel01Icon}
        tone="text-error"
      />
    </div>
  )

  if (accordion) {
    return (
      <div
        data-ds="ConsentPanel"
        data-mode="accordion"
        data-state={enabled ? 'open' : 'closed'}
        className={cn(consentPanelVariants({ mode }), className)}
        {...props}
      >
        <div className="flex items-center gap-4 px-4 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="type-body-sm-medium text-foreground">{heading}</p>
            <p className="type-body-sm-regular text-secondary">{line}</p>
          </div>
          <Switch
            showLabel={false}
            aria-label={heading}
            checked={enabled}
            onCheckedChange={(next) => onEnabledChange?.(next)}
          />
        </div>
        {enabled && (
          <div className="border-t border-subtle px-4 pt-3.5 pb-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
            {lists}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      data-ds="ConsentPanel"
      data-mode="card"
      className={cn(consentPanelVariants({ mode }), className)}
      {...props}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-3">
          <HugeiconsIcon icon={Shield01Icon} strokeWidth={1.5} className="size-5 text-foreground" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="type-body-sm-medium text-foreground">{heading}</p>
          <p className="type-caption-xs-regular text-tertiary">{line}</p>
        </div>
      </div>
      {lists}
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" label={declineLabel} onClick={onDecline} />
        <Button label={acceptLabel} onClick={onAccept} />
      </div>
    </div>
  )
}
