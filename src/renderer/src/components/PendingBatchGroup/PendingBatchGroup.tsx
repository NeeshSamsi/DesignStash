import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  PENDING_BATCH_GROUP_CONTRACT,
  PENDING_BATCH_GROUP_DEFAULTS,
  type PendingBatchGroupContractProps
} from './PendingBatchGroup.types'
import { pendingBatchGroupVariants } from './PendingBatchGroup.variants'

export interface PendingBatchGroupProps extends PendingBatchGroupContractProps {
  className?: string
}

/**
 * PendingBatchGroup — Unreviewed items grouped by import batch.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-6840
 */
export function PendingBatchGroup({ className, ...rest }: PendingBatchGroupProps) {
  const props = { ...PENDING_BATCH_GROUP_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="PendingBatchGroup" on the root element.
  return (
    <ScaffoldStub
      contract={PENDING_BATCH_GROUP_CONTRACT}
      props={props}
      className={cn(pendingBatchGroupVariants({ discarding: props.discarding }), className)}
    />
  )
}
