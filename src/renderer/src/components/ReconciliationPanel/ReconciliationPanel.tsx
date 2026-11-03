import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  RECONCILIATION_PANEL_CONTRACT,
  RECONCILIATION_PANEL_DEFAULTS,
  type ReconciliationPanelContractProps
} from './ReconciliationPanel.types'
import { reconciliationPanelVariants } from './ReconciliationPanel.variants'

export interface ReconciliationPanelProps extends ReconciliationPanelContractProps {
  className?: string
}

/**
 * ReconciliationPanel — Resolve library drift inside a blocking Modal.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-6619
 * Today: ReconciliationModal.tsx
 */
export function ReconciliationPanel({ className, ...rest }: ReconciliationPanelProps) {
  const props = { ...RECONCILIATION_PANEL_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ReconciliationPanel" on the root element.
  return (
    <ScaffoldStub
      contract={RECONCILIATION_PANEL_CONTRACT}
      props={props}
      className={cn(reconciliationPanelVariants({ state: props.state }), className)}
    />
  )
}
