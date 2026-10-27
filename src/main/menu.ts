import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '@shared/ipc/menu'
import type { UndoContext } from '@shared/ipc/undo'

/**
 * Help › DesignStash Guide opens this. There is no guide yet, so the item stays out of the menu
 * until the address is set here.
 */
export const GUIDE_URL: string | null = null

/** Edit › Undo and Redo as they read now. */
export interface UndoMenuItems {
  undo: { label: string; enabled: boolean }
  redo: { label: string; enabled: boolean }
}

/** Before the history says otherwise: plain, and on, so a field's own undo always works. */
const PLAIN_UNDO: UndoMenuItems = {
  undo: { label: 'Undo', enabled: true },
  redo: { label: 'Redo', enabled: true }
}

/** The next undo or redo in the app's history. A toast's out-of-order undo is a `reversal`. */
interface UndoMenuStep {
  label: string
  reversal: boolean
}

/**
 * Edit › Undo and Redo, named from the app's history ("Undo Move to Trash") and off when it has
 * nothing. In a field or an open flow they read plain "Undo" and "Redo", since ⌘Z goes to that
 * field's or flow's own steps. The step a toast's out-of-order undo recorded reads plain "Undo":
 * ⌘Z puts that action back, which its name would tell the other way round.
 */
export function undoMenuItems(
  context: UndoContext,
  next: { undo: UndoMenuStep | null; redo: UndoMenuStep | null }
): UndoMenuItems {
  if (context !== 'app') return PLAIN_UNDO
  const name = (verb: string, step: UndoMenuStep | null) =>
    step && !step.reversal ? `${verb} ${step.label}` : verb
  return {
    undo: { label: name('Undo', next.undo), enabled: next.undo !== null },
    redo: { label: name('Redo', next.redo), enabled: next.redo !== null }
  }
}

export interface MenuDeps {
  /** Hand a command to the window, which runs it like the matching in-app control. */
  send: (command: MenuCommand) => void
  openExternal: (url: string) => void
  /** Edit › Undo and Redo as they read now. Plain and on without one. */
  undo?: UndoMenuItems
  /** Adds Reload and the dev tools to View. */
  dev?: boolean
  /** Where Help › DesignStash Guide goes; without one there is no Guide item. */
  guideUrl?: string | null
}

/**
 * The window owns every app shortcut (lib/shortcuts.ts knows about fields, scopes and modals), so
 * the menu only shows the keys and never registers them: one key press never runs twice. Undo and
 * Redo are the exception (see the Edit menu).
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
  const undo = deps.undo ?? PLAIN_UNDO
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
    {
      label: 'Edit',
      submenu: [
        // The menu owns ⌘Z and ⇧⌘Z, so the key reaches the window as a command, even inside a
        // dialog. The window sends it to a focused field, an open flow, or the app's history.
        {
          label: undo.undo.label,
          enabled: undo.undo.enabled,
          accelerator: 'CmdOrCtrl+Z',
          click: () => deps.send('undo')
        },
        {
          label: undo.redo.label,
          enabled: undo.redo.enabled,
          accelerator: 'Shift+CmdOrCtrl+Z',
          click: () => deps.send('redo')
        },
        separator,
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        command(deps, 'Search', 'search', 'CmdOrCtrl+F'),
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
      submenu: [...guide, command(deps, 'Report a Problem…', 'report-problem')]
    }
  ]
}

export function installAppMenu(deps: MenuDeps): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(deps)))
}
