import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '@shared/ipc/menu'

/** Help › DesignStash Guide. Neesh gives the real address later. */
export const GUIDE_URL = 'https://designstash.app/guide'

export interface MenuDeps {
  /** Hand a command to the window, which runs it like the matching in-app control. */
  send: (command: MenuCommand) => void
  openExternal: (url: string) => void
  /** Adds Reload and the dev tools to View. */
  dev?: boolean
}

/**
 * The window owns every app shortcut (lib/shortcuts.ts knows about fields, scopes and modals), so
 * the menu only shows the keys and never registers them: one key press never runs twice.
 */
function command(
  deps: MenuDeps,
  label: string,
  name: MenuCommand,
  accelerator?: string
): MenuItemConstructorOptions {
  return {
    label,
    click: () => deps.send(name),
    ...(accelerator && { accelerator, registerAccelerator: false })
  }
}

export function buildMenuTemplate(deps: MenuDeps): MenuItemConstructorOptions[] {
  const separator: MenuItemConstructorOptions = { type: 'separator' }
  const devItems: MenuItemConstructorOptions[] = deps.dev
    ? [separator, { role: 'reload' }, { role: 'toggleDevTools' }]
    : []

  return [
    {
      label: 'DesignStash',
      submenu: [
        command(deps, 'About DesignStash', 'about'),
        separator,
        command(deps, 'Settings…', 'settings', 'CmdOrCtrl+,'),
        command(deps, 'Check for Updates…', 'check-updates'),
        separator,
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        separator,
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        command(deps, 'Add Files…', 'import-files', 'CmdOrCtrl+O'),
        command(deps, 'Add Folder…', 'import-folder', 'CmdOrCtrl+Shift+O')
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        command(deps, 'Search', 'search'),
        separator,
        command(deps, 'My Stash', 'view:all'),
        command(deps, 'Starred', 'view:starred'),
        command(deps, 'To sort', 'view:to-sort'),
        command(deps, 'To stash', 'view:to-stash'),
        command(deps, 'Trash', 'view:trash'),
        ...devItems,
        separator,
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      label: 'Help',
      submenu: [
        { label: 'DesignStash Guide', click: () => deps.openExternal(GUIDE_URL) },
        command(deps, 'Report a Problem…', 'report-problem')
      ]
    }
  ]
}

export function installAppMenu(deps: MenuDeps): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(deps)))
}
