import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  ABOUT_PANEL_CONTRACT,
  ABOUT_PANEL_DEFAULTS,
  type AboutPanelContractProps
} from './AboutPanel.types'
import { aboutPanelVariants } from './AboutPanel.variants'

export interface AboutPanelProps extends AboutPanelContractProps {
  className?: string
}

/**
 * AboutPanel — App identity and the update lifecycle.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-5968
 * Today: SettingsPage.tsx AboutSection
 */
export function AboutPanel({ className, ...rest }: AboutPanelProps) {
  const props = { ...ABOUT_PANEL_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="AboutPanel" on the root element.
  return (
    <ScaffoldStub
      contract={ABOUT_PANEL_CONTRACT}
      props={props}
      className={cn(aboutPanelVariants({ state: props.state }), className)}
    />
  )
}
