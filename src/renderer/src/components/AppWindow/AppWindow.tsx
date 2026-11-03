import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  APP_WINDOW_CONTRACT,
  APP_WINDOW_DEFAULTS,
  type AppWindowContractProps
} from './AppWindow.types'
import { appWindowVariants } from './AppWindow.variants'

export interface AppWindowProps extends AppWindowContractProps {
  className?: string
}

/**
 * AppWindow — The window: traffic lights, centred GlobalSearch, SidebarNav (176), content panel with PageHeader + page slot. modal-open adds the scrim; drag-over adds DropOverlay.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-2248
 * Today: AppShell.tsx
 */
export function AppWindow({ className, ...rest }: AppWindowProps) {
  const props = { ...APP_WINDOW_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="AppWindow" on the root element.
  return (
    <ScaffoldStub
      contract={APP_WINDOW_CONTRACT}
      props={props}
      className={cn(appWindowVariants({ state: props.state }), className)}
    />
  )
}
