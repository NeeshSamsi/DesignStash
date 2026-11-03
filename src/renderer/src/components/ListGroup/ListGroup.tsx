import { Fragment, type ReactNode } from 'react'
import { ListRow } from '@renderer/components/ListRow'
import { SectionHeader } from '@renderer/components/SectionHeader'
import { cn } from '@renderer/lib/utils'
import { LIST_GROUP_DEFAULTS, type ListGroupContractProps } from './ListGroup.types'
import { listGroupVariants } from './ListGroup.variants'

export interface ListGroupProps extends ListGroupContractProps {
  /** Rows beyond the five slots (real lists are longer than the Figma sample). */
  children?: ReactNode
  className?: string
}

/**
 * ListGroup — A titled list: SectionHeader + N ListRows.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=267-4998
 * Screens fill `header` and `row1`…`row5` (or pass their own rows as children). Slots left empty
 * show the Figma sample, for the catalog.
 */
export function ListGroup({ className, children, ...rest }: ListGroupProps) {
  const { header, row1, row2, row3, row4, row5, ...props } = { ...LIST_GROUP_DEFAULTS, ...rest }
  const slots = [row1, row2, row3, row4, row5].slice(0, Number(props.rows))
  const custom = children !== undefined
  return (
    <div
      data-ds="ListGroup"
      data-density={props.density}
      className={cn(listGroupVariants({ density: props.density, rows: props.rows }), className)}
    >
      {header ?? <SectionHeader />}
      {custom
        ? children
        : slots.map((slot, i) => (
            <Fragment key={i}>{slot ?? <ListRow density={props.density} />}</Fragment>
          ))}
    </div>
  )
}
