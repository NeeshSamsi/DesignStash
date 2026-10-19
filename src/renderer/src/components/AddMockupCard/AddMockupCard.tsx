import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  ADD_MOCKUP_CARD_CONTRACT,
  ADD_MOCKUP_CARD_DEFAULTS,
  type AddMockupCardContractProps
} from './AddMockupCard.types'
import { addMockupCardVariants } from './AddMockupCard.variants'

export interface AddMockupCardProps extends AddMockupCardContractProps {
  className?: string
}

/**
 * AddMockupCard — The add affordance in the library grid: always the first card in My Stash › All (hidden in search, filter and Starred); on an empty library it is the only card. Recessed well with a faint dashed cover, same footprint as MockupCard. Click / ↵ opens the Add menu; dragging PSDs over the window shows DropOverlay. Rules: design/specs/library.md.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=583-6960
 */
export function AddMockupCard({ className, ...rest }: AddMockupCardProps) {
  const props = { ...ADD_MOCKUP_CARD_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="AddMockupCard" on the root element.
  return (
    <ScaffoldStub
      contract={ADD_MOCKUP_CARD_CONTRACT}
      props={props}
      className={cn(addMockupCardVariants(), className)}
    />
  )
}
