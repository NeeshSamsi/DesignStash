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
 * SettingsLayout — Settings page: PageHeader, line Tabs, 720-wide panel per tab.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-4771
 * Today: SettingsPage.tsx
 */
export function SettingsLayout({ className, ...rest }: SettingsLayoutProps) {
  const props = { ...SETTINGS_LAYOUT_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="SettingsLayout" on the root element.
  return (
    <ScaffoldStub
      contract={SETTINGS_LAYOUT_CONTRACT}
      props={props}
      className={cn(settingsLayoutVariants({ tab: props.tab }), className)}
    />
  )
}
