import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  CONSENT_PANEL_CONTRACT,
  CONSENT_PANEL_DEFAULTS,
  type ConsentPanelContractProps
} from './ConsentPanel.types'
import { consentPanelVariants } from './ConsentPanel.variants'

export interface ConsentPanelProps extends ConsentPanelContractProps {
  className?: string
}

/**
 * ConsentPanel — Telemetry disclosure + choice: collect / never collect.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-4275
 * Today: SettingsPrivacyPane + TelemetryDisclosure
 */
export function ConsentPanel({ className, ...rest }: ConsentPanelProps) {
  const props = { ...CONSENT_PANEL_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ConsentPanel" on the root element.
  return (
    <ScaffoldStub
      contract={CONSENT_PANEL_CONTRACT}
      props={props}
      className={cn(
        consentPanelVariants({ variant: props.variant, state: props.state }),
        className
      )}
    />
  )
}
