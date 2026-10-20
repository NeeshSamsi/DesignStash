import type { ComponentProps, ReactNode } from 'react'
import { PileStep } from '@renderer/components/PileStep'
import { cn } from '@renderer/lib/utils'
import { PILE_RAIL_DEFAULTS, type PileRailContractProps } from './PileRail.types'
import { pileRailVariants } from './PileRail.variants'

export interface PileRailProps
  extends
    PileRailContractProps,
    Omit<ComponentProps<'nav'>, keyof PileRailContractProps | 'title'> {
  /** The PileStep rows. Figma's sample until given. */
  steps?: ReactNode
}

/**
 * PileRail — The pile you're working through in Look it over: a recessed well right of the form, full body height.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=566-15524
 * Head: "PILE n OF m" and the pile's title; then PileStep rows (top mockup, variants, Review & stash pile).
 * Presentational: the Look it over screen owns which step is current and what a click does.
 */
export function PileRail({ className, steps, ...rest }: PileRailProps) {
  const { pile, title, ...props } = { ...PILE_RAIL_DEFAULTS, ...rest }
  return (
    <nav
      data-ds="PileRail"
      aria-label={`${pile}: ${title}`}
      className={cn(pileRailVariants(), className)}
      {...props}
    >
      <div className="flex flex-col gap-0.5 pb-2 pl-2">
        <p className="truncate type-label-xs-medium font-semibold text-tertiary">{pile}</p>
        <p className="truncate type-body-sm-medium text-foreground">{title}</p>
      </div>
      <div className="flex flex-col gap-1">
        {steps ?? (
          <>
            <PileStep label="Top · phone_front" />
            <PileStep status="current" />
            <PileStep status="todo" label="Variant · phone_back" />
            <PileStep status="todo" label="Variant · phone_top" />
            <PileStep status="todo" label="Review & stash pile" showConnector={false} />
          </>
        )}
      </div>
    </nav>
  )
}
