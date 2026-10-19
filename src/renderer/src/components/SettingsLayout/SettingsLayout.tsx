import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  SETTINGS_LAYOUT_CONTRACT,
  SETTINGS_LAYOUT_DEFAULTS,
  type SettingsLayoutContractProps
} from './SettingsLayout.types'
import { settingsLayoutVariants } from './SettingsLayout.variants'

export interface SettingsLayoutProps extends SettingsLayoutContractProps {
  className?: string
}

/**
 * SettingsLayout — Settings as a modal over the app (880×760): section list on the left (same selected style as the sidebar), pane title + close, grouped rows (title, real value, control on the right, all inline buttons secondary). Switches that unlock more are accordions. Sections: my-stash · ai-model · tags · privacy · about. Rules: design/specs/settings.md.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-4771
 * Today: SettingsModal.tsx (replaces SettingsPage.tsx)
 */
export function SettingsLayout({ className, ...rest }: SettingsLayoutProps) {
  const props = { ...SETTINGS_LAYOUT_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="SettingsLayout" on the root element.
  return (
    <ScaffoldStub
      contract={SETTINGS_LAYOUT_CONTRACT}
      props={props}
      className={cn(settingsLayoutVariants({ section: props.section }), className)}
    />
  )
}
