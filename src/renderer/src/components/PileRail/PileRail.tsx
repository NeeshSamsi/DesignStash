import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  PILE_RAIL_CONTRACT,
  PILE_RAIL_DEFAULTS,
  type PileRailContractProps
} from './PileRail.types'
import { pileRailVariants } from './PileRail.variants'

export interface PileRailProps extends PileRailContractProps {
  className?: string
}

/**
 * PileRail — The pile you’re working through in Look it over: a recessed well right of the form, full body height. pile = “PILE n OF m”, title = the pile’s title, steps = PileStep rows. Everything in a pile is a draft until Stash pile, so steps are clickable. Rules: design/specs/piles.md.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=566-15524
 */
export function PileRail({ className, ...rest }: PileRailProps) {
  const props = { ...PILE_RAIL_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="PileRail" on the root element.
  return (
    <ScaffoldStub
      contract={PILE_RAIL_CONTRACT}
      props={props}
      className={cn(pileRailVariants(), className)}
    />
  )
}
