import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  STAT_TILE_CONTRACT,
  STAT_TILE_DEFAULTS,
  type StatTileContractProps
} from './StatTile.types'
import { statTileVariants } from './StatTile.variants'

export interface StatTileProps extends StatTileContractProps {
  className?: string
}

/**
 * StatTile — A count with a label and tone.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-798
 */
export function StatTile({ className, ...rest }: StatTileProps) {
  const props = { ...STAT_TILE_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="StatTile" on the root element.
  return (
    <ScaffoldStub
      contract={STAT_TILE_CONTRACT}
      props={props}
      className={cn(statTileVariants({ tone: props.tone }), className)}
    />
  )
}
