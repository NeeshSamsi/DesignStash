import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CpuIcon, HardDriveIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/ui/badge'
import {
  HARDWARE_SUMMARY_DEFAULTS,
  type HardwareSummaryContractProps
} from './HardwareSummary.types'
import { hardwareSummaryVariants } from './HardwareSummary.variants'

export interface HardwareSummaryProps
  extends
    HardwareSummaryContractProps,
    Omit<ComponentProps<'div'>, keyof HardwareSummaryContractProps | 'title'> {
  /** This Mac: "Apple M2 Pro · 32 GB memory". Figma's sample for the variant until given. */
  title?: string
  /** What it can run, or why it can't: one plain line. Figma's sample until given. */
  description?: string
  /** The badge text. Figma's for the variant until given. */
  badge?: string
}

const SAMPLE = {
  supported: {
    title: 'Apple M2 Pro · 32 GB memory',
    description: 'Your Mac can comfortably run medium models (up to 4 GB).',
    badge: 'Apple Silicon'
  },
  unsupported: {
    title: 'Intel Core i7 · 16 GB memory',
    description:
      'On-device AI needs Apple Silicon. Everything else works, and titles come from file names.',
    badge: 'Not supported'
  },
  'low-disk': {
    title: 'Apple M1 · 8 GB memory · 3.1 GB free',
    description: 'The recommended model needs 4.2 GB. Free up some space or try a smaller model.',
    badge: 'Low disk'
  }
} as const

/**
 * HardwareSummary — This Mac and the model size it can run; warns on Intel and low disk.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-3780
 * The same card in onboarding and in Settings › AI model. Pass the real chip, memory and disk as
 * `title`, `description` and `badge`; without them it shows Figma's sample for the variant.
 */
export function HardwareSummary({
  className,
  title,
  description,
  badge,
  ...rest
}: HardwareSummaryProps) {
  const { variant, ...props } = { ...HARDWARE_SUMMARY_DEFAULTS, ...rest }
  const sample = SAMPLE[variant]
  const supported = variant === 'supported'
  return (
    <div
      data-ds="HardwareSummary"
      data-variant={variant}
      className={cn(hardwareSummaryVariants({ variant }), className)}
      {...props}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-3">
        <HugeiconsIcon
          icon={variant === 'low-disk' ? HardDriveIcon : CpuIcon}
          strokeWidth={ICON_STROKE}
          className="size-5 text-foreground"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-body-sm-medium text-foreground">{title ?? sample.title}</p>
        <p className="type-caption-xs-regular text-tertiary">{description ?? sample.description}</p>
      </div>
      <Badge variant={supported ? 'success' : 'warning'} className="shrink-0">
        {supported && <HugeiconsIcon icon={Tick02Icon} strokeWidth={ICON_STROKE} />}
        {badge ?? sample.badge}
      </Badge>
    </div>
  )
}
