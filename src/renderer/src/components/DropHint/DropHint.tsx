import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  DROP_HINT_CONTRACT,
  DROP_HINT_DEFAULTS,
  type DropHintContractProps
} from './DropHint.types'
import { dropHintVariants } from './DropHint.variants'

export interface DropHintProps extends DropHintContractProps {
  className?: string
}

/**
 * DropHint — Cursor-following label shown while files are dragged over a non-droppable area. My Stash and To sort are the only drop targets.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=374-5713
 */
export function DropHint({ className, ...rest }: DropHintProps) {
  const props = { ...DROP_HINT_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="DropHint" on the root element.
  return (
    <ScaffoldStub
      contract={DROP_HINT_CONTRACT}
      props={props}
      className={cn(dropHintVariants(), className)}
    />
  )
}
