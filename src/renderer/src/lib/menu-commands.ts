import { useEffect, useRef } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { MenuCommand } from '@shared/ipc/menu'
import { useUiStore, type AppView } from '@renderer/stores/uiStore'
import { subscribePush } from './subscribe'

export interface MenuActions {
  addFiles?: (() => void) | undefined
  addFolder?: (() => void) | undefined
  focusSearch: () => void
}

/** Every modal dialog draws one of these while it is open (Settings included). */
const MODAL_OVERLAY = '[data-slot="dialog-overlay"], [data-slot="alert-dialog-overlay"]'

const VIEWS: Partial<Record<MenuCommand, AppView>> = {
  'view:all': 'all',
  'view:starred': 'starred',
  'view:to-sort': 'to-sort',
  'view:to-stash': 'to-stash',
  'view:trash': 'trash'
}

/**
 * Runs a menu item the way its in-app control would. A menu item can't reach what a dialog
 * covers, just as a click can't: with Settings open only the Settings items work (they switch
 * its pane), and with any other dialog open nothing does.
 */
export function runMenuCommand(command: MenuCommand, actions: MenuActions): void {
  const ui = useUiStore.getState()
  const overlays = document.querySelectorAll(MODAL_OVERLAY).length
  const otherDialogOpen = overlays > (ui.settingsOpen ? 1 : 0)
  if (otherDialogOpen) return

  switch (command) {
    case 'settings':
      ui.openSettings()
      return
    case 'about':
    case 'report-problem':
      ui.openSettings('about')
      return
    case 'check-updates':
      ui.openSettings('about')
      ui.requestUpdateCheck()
      return
  }

  if (ui.settingsOpen) return
  if (command === 'import-files') actions.addFiles?.()
  else if (command === 'import-folder') actions.addFolder?.()
  else if (command === 'search') actions.focusSearch()
  else {
    const view = VIEWS[command]
    if (view) ui.setView(view)
  }
}

/** Listens for the macOS menu's commands while the app is on screen. */
export function useMenuCommands(actions: MenuActions): void {
  const latest = useRef(actions)
  useEffect(() => {
    latest.current = actions
  })
  useEffect(
    () =>
      subscribePush(IPC_CHANNELS.MENU_COMMAND, (command) =>
        runMenuCommand(command, latest.current)
      ),
    []
  )
}
