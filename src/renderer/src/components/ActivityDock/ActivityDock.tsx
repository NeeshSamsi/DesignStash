import type { ReactNode } from 'react'
import { Bug01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { ACTIVITY_DOCK_DEFAULTS, type ActivityDockContractProps } from './ActivityDock.types'
import { activityDockVariants } from './ActivityDock.variants'

export interface ActivityDockProps extends ActivityDockContractProps {
  /** Toast stack (a Toast). Shown when `toast` is on and this is given. */
  toastContent?: ReactNode
  /** The copy card (CopyWidget). Shown when `import` is on and this is given. */
  importContent?: ReactNode
  /** DEV only: the debug button's action. */
  onDebug?: () => void
  className?: string
}

/**
 * ActivityDock — Bottom-right stack for toasts, the import card and the DEV debug button.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-2499
 * A layout stack: it holds what it is given and draws no placeholder. The debug button
 * shows for `build="dev"`.
 */
export function ActivityDock({
  className,
  toastContent,
  importContent,
  onDebug,
  ...rest
}: ActivityDockProps) {
  const props = { ...ACTIVITY_DOCK_DEFAULTS, ...rest }
  return (
    <div
      data-ds="ActivityDock"
      data-build={props.build}
      className={cn(activityDockVariants({ build: props.build }), className)}
    >
      {props.toast && toastContent}
      {props.import && importContent}
      {props.build === 'dev' && (
        <Button variant="secondary" size="icon" aria-label="Open debug panel" onClick={onDebug}>
          <HugeiconsIcon icon={Bug01Icon} strokeWidth={1.5} />
        </Button>
      )}
    </div>
  )
}
