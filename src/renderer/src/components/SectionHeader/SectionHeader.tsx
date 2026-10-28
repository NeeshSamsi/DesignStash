import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/components/Badge'
import { SECTION_HEADER_DEFAULTS, type SectionHeaderContractProps } from './SectionHeader.types'
import { sectionHeaderVariants } from './SectionHeader.variants'

export interface SectionHeaderProps extends SectionHeaderContractProps {
  /** The tally beside the title. Shown when `count` is on and a value is given. */
  countValue?: number | string
  /** Bulk actions on the right, normally ghost `xs` Buttons (“Add all”, “Ignore all”). Shown when `actions` is on. */
  actionsContent?: ReactNode
  className?: string
}

/**
 * SectionHeader — Title + count + bulk actions over a list.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-1350
 * `sticky` pins to the top of its scroll container on a surface-1 strip.
 */
export function SectionHeader({
  className,
  countValue,
  actionsContent,
  ...rest
}: SectionHeaderProps) {
  const props = { ...SECTION_HEADER_DEFAULTS, ...rest }
  return (
    <div
      data-ds="SectionHeader"
      data-variant={props.variant}
      className={cn(sectionHeaderVariants({ variant: props.variant }), className)}
    >
      <div className="flex items-center gap-2">
        <h3 className="type-body-sm-medium text-foreground">{props.title}</h3>
        {props.count && countValue !== undefined && <Badge variant="count">{countValue}</Badge>}
      </div>
      {props.actions && actionsContent && (
        <div className="flex items-start gap-1">{actionsContent}</div>
      )}
    </div>
  )
}
