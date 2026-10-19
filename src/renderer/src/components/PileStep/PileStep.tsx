import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  PILE_STEP_CONTRACT,
  PILE_STEP_DEFAULTS,
  type PileStepContractProps
} from './PileStep.types'
import { pileStepVariants } from './PileStep.variants'

export interface PileStepProps extends PileStepContractProps {
  className?: string
}

/**
 * PileStep — One mockup in a pile, in PileRail: done (draft ready) · current · todo · skipped. show-connector draws the line to the next step. Rules: design/specs/piles.md.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=566-15523
 */
export function PileStep({ className, ...rest }: PileStepProps) {
  const props = { ...PILE_STEP_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="PileStep" on the root element.
  return (
    <ScaffoldStub
      contract={PILE_STEP_CONTRACT}
      props={props}
      className={cn(pileStepVariants({ status: props.status }), className)}
    />
  )
}
