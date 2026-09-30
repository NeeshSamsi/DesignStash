import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  LIST_GROUP_CONTRACT,
  LIST_GROUP_DEFAULTS,
  type ListGroupContractProps
} from './ListGroup.types'
import { listGroupVariants } from './ListGroup.variants'

export interface ListGroupProps extends ListGroupContractProps {
  className?: string
}

/**
 * ListGroup — A titled list: SectionHeader + N ListRows.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=267-4998
 */
export function ListGroup({ className, ...rest }: ListGroupProps) {
  const props = { ...LIST_GROUP_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ListGroup" on the root element.
  return (
    <ScaffoldStub
      contract={LIST_GROUP_CONTRACT}
      props={props}
      className={cn(listGroupVariants({ density: props.density, rows: props.rows }), className)}
    />
  )
}
