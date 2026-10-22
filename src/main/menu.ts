import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '@shared/ipc/menu'

/**
 * Help › DesignStash Guide opens this. There is no guide yet, so the item stays out of the menu
 * until the address is set here.
 */
export const GUIDE_URL: string | null = null

export interface MenuDeps {
  /** Hand a command to the window, which runs it like the matching in-app control. */
  send: (command: MenuCommand) => void
  openExternal: (url: string) => void
  /** Adds Reload and the dev tools to View. */
  dev?: boolean
  /** Where Help › DesignStash Guide goes; without one there is no Guide item. */
  guideUrl?: string | null
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
  const guideUrl = deps.guideUrl === undefined ? GUIDE_URL : deps.guideUrl
  const guide: MenuItemConstructorOptions[] = guideUrl
    ? [{ label: 'DesignStash Guide', click: () => deps.openExternal(guideUrl) }]
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
        command(deps, 'Search', 'search', 'CmdOrCtrl+K'),
        separator,
        command(deps, 'My Stash', 'view:all', 'CmdOrCtrl+1'),
        command(deps, 'Starred', 'view:starred', 'CmdOrCtrl+2'),
        command(deps, 'To sort', 'view:to-sort', 'CmdOrCtrl+3'),
        command(deps, 'To stash', 'view:to-stash', 'CmdOrCtrl+4'),
        command(deps, 'Trash', 'view:trash', 'CmdOrCtrl+5'),
        ...devItems,
        separator,
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      label: 'Help',
      submenu: [...guide, command(deps, 'Report a Problem…', 'report-problem')]
    }
  ]
}

export function installAppMenu(deps: MenuDeps): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(deps)))
}
