import { DropOverlay } from '@renderer/components/DropOverlay'
import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import { APP_WINDOW_DEFAULTS, type AppWindowContractProps } from './AppWindow.types'
import {
  appWindowPanelClass,
  appWindowTitleBarClass,
  appWindowVariants
} from './AppWindow.variants'

export interface AppWindowProps extends AppWindowContractProps {
  className?: string
  /** The details sidebar: its own surface to the right of the content panel (380 wide, 8 apart). */
  aside?: ReactNode
  /** Whether the sidebar is asked for. The panel's width and top-right corner follow it. */
  asideOpen?: boolean
}

/**
 * AppWindow — The window: centred GlobalSearch, SidebarNav, content panel with PageHeader + page slot.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-2248
 * Layout only. macOS draws the traffic lights over the top-left. Dialogs go in `dialog`, which
 * renders in a modal layer above the window (with the scrim for `state="modal-open"`), never in
 * `page`. `state="drag-over"` shows `drop` (a DropOverlay unless you pass one).
 */
export function AppWindow({ className, aside, asideOpen = false, ...rest }: AppWindowProps) {
  const props = { ...APP_WINDOW_DEFAULTS, ...rest }
  const modal = props.state === 'modal-open' || props.dialog !== undefined
  return (
    <div
      data-ds="AppWindow"
      data-state={props.state}
      className={cn(appWindowVariants({ state: props.state }), className)}
    >
      <div className={appWindowTitleBarClass}>
        <div className="w-sidebar shrink-0" />
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="app-no-drag max-w-full min-w-0">{props.search}</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-44 shrink-0">{props.sidebar}</div>
        <main
          className={cn(appWindowPanelClass, asideOpen ? 'rounded-tr-3xl' : 'rounded-tr-none')}
          style={{ viewTransitionName: 'main-panel' }}
        >
          {props.showHeader && props.header}
          <div className="-m-2 min-h-0 flex-1 overflow-auto rounded-md p-2">{props.page}</div>
        </main>
        {aside !== undefined && (
          <div
            data-slot="aside"
            data-open={asideOpen}
            inert={!asideOpen || undefined}
            className={cn('h-full shrink-0 overflow-hidden', asideOpen ? 'w-99' : 'w-0')}
          >
            <div className="h-full w-99 py-0 pr-2 pl-2">{aside}</div>
          </div>
        )}
      </div>
      {modal && (
        <div
          data-slot="modal-layer"
          className="absolute inset-0 z-40 flex items-center justify-center"
        >
          {props.state === 'modal-open' && <div className="absolute inset-0 bg-overlay" />}
          <div className="relative">{props.dialog}</div>
        </div>
      )}
      {props.state === 'drag-over' && (props.drop ?? <DropOverlay />)}
    </div>
  )
}
