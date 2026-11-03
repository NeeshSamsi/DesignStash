import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { LIST_ROW_CONTRACT, LIST_ROW_DEFAULTS, type ListRowContractProps } from './ListRow.types'
import { listRowVariants } from './ListRow.variants'

export interface ListRowProps extends ListRowContractProps {
  className?: string
}

/**
 * ListRow — Generic row: media or thumb · title/subtitle · actions.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-1260
 * Today: ui/item.tsx → ListRow
 */
export function ListRow({ className, ...rest }: ListRowProps) {
  const props = { ...LIST_ROW_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ListRow" on the root element.
  return (
    <ScaffoldStub
      contract={LIST_ROW_CONTRACT}
      props={props}
      className={cn(listRowVariants({ density: props.density, state: props.state }), className)}
    />
  )
}
