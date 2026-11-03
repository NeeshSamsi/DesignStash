import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  ACTIVITY_DOCK_CONTRACT,
  ACTIVITY_DOCK_DEFAULTS,
  type ActivityDockContractProps
} from './ActivityDock.types'
import { activityDockVariants } from './ActivityDock.variants'

export interface ActivityDockProps extends ActivityDockContractProps {
  className?: string
}

/**
 * ActivityDock — Bottom-right stack for toasts, the import card and the DEV debug button.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-2499
 */
export function ActivityDock({ className, ...rest }: ActivityDockProps) {
  const props = { ...ACTIVITY_DOCK_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ActivityDock" on the root element.
  return (
    <ScaffoldStub
      contract={ACTIVITY_DOCK_CONTRACT}
      props={props}
      className={cn(activityDockVariants({ build: props.build }), className)}
    />
  )
}
