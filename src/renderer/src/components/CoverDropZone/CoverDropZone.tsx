import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  COVER_DROP_ZONE_CONTRACT,
  COVER_DROP_ZONE_DEFAULTS,
  type CoverDropZoneContractProps
} from './CoverDropZone.types'
import { coverDropZoneVariants } from './CoverDropZone.variants'

export interface CoverDropZoneProps extends CoverDropZoneContractProps {
  className?: string
}

/**
 * CoverDropZone — Drag-drop or click to upload a cover; required blocks Approve.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-3425
 * Today: ApprovalStepper.tsx upload zone
 */
export function CoverDropZone({ className, ...rest }: CoverDropZoneProps) {
  const props = { ...COVER_DROP_ZONE_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="CoverDropZone" on the root element.
  return (
    <ScaffoldStub
      contract={COVER_DROP_ZONE_CONTRACT}
      props={props}
      className={cn(
        coverDropZoneVariants({ state: props.state }),
        className
      )}
    />
  )
}
