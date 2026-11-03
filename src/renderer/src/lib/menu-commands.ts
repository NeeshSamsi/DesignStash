import { useEffect, useRef } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { MenuCommand } from '@shared/ipc/menu'
import { useUiStore, type AppView } from '@renderer/stores/uiStore'
import { subscribePush } from './subscribe'
import { ipcUndoRoutes, routeUndo, useUndoContextReport } from './undo-router'

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
 * its pane, or raise Report a problem over it), and with any other dialog open nothing does.
 * Edit › Undo and Redo go first: they act on the innermost context, an open flow's dialog included.
 */
export function runMenuCommand(command: MenuCommand, actions: MenuActions): void {
  if (command === 'undo' || command === 'redo') {
    void routeUndo(command, ipcUndoRoutes)
    return
  }
  const ui = useUiStore.getState()
  const overlays = document.querySelectorAll(MODAL_OVERLAY).length
  const otherDialogOpen = overlays > (ui.settingsOpen ? 1 : 0)
  if (otherDialogOpen) return

  switch (command) {
    case 'settings':
      ui.openSettings()
      return
    case 'about':
      ui.openSettings('about')
      return
    case 'report-problem':
      ui.openReport()
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

/**
 * Listens for the macOS menu's commands while the app is on screen. Once listening, it runs the
 * item that brought the window back, if one was chosen while every window was closed.
 */
export function useMenuCommands(actions: MenuActions): void {
  const latest = useRef(actions)
  useEffect(() => {
    latest.current = actions
  })
  useUndoContextReport()
  useEffect(() => {
    let live = true
    const stop = subscribePush(IPC_CHANNELS.MENU_COMMAND, (command) =>
      runMenuCommand(command, latest.current)
    )
    void window.api
      .invoke(IPC_CHANNELS.MENU_PENDING, undefined)
      .then((res) => {
        // A fresh window has nothing to undo, so a waiting Undo or Redo is never replayed.
        const command = live && res.success ? res.data : null
        if (command && command !== 'undo' && command !== 'redo')
          runMenuCommand(command, latest.current)
      })
      .catch(() => {})
    return () => {
      live = false
      stop()
    }
  }, [])
}
