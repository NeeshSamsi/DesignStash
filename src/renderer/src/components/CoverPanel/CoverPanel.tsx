import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  COVER_PANEL_CONTRACT,
  COVER_PANEL_DEFAULTS,
  type CoverPanelContractProps
} from './CoverPanel.types'
import { coverPanelVariants } from './CoverPanel.variants'

export interface CoverPanelProps extends CoverPanelContractProps {
  className?: string
}

/**
 * CoverPanel — Resolved cover + source + Replace; sidecar asks to confirm; none → CoverDropZone.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-3545
 * Today: ApprovalStepper.tsx CoverSection
 */
export function CoverPanel({ className, ...rest }: CoverPanelProps) {
  const props = { ...COVER_PANEL_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="CoverPanel" on the root element.
  return (
    <ScaffoldStub
      contract={COVER_PANEL_CONTRACT}
      props={props}
      className={cn(coverPanelVariants({ source: props.source }), className)}
    />
  )
}
