import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

/**
 * What a macOS menu item asks the window to do. The main process only sends these; the renderer
 * runs each one the same way as the in-app control it stands for.
 */
export const MenuCommandSchema = z.enum([
  'about',
  'settings',
  'check-updates',
  'import-files',
  'import-folder',
  'search',
  'view:all',
  'view:starred',
  'view:to-sort',
  'view:to-stash',
  'view:trash',
  'report-problem',
  // Edit › Undo and Redo (⌘Z, ⇧⌘Z). The window routes them: a field, an open flow, or the app.
  'undo',
  'redo'
])
export type MenuCommand = z.infer<typeof MenuCommandSchema>

/** The macOS menu. Its commands arrive on the menu:command push. */
export const menuContract = {
  /**
   * A menu item chosen while no window was open, which opened this one. The window asks once it
   * listens for menu:command, and gets it once; null when there is none.
   */
  [IPC_CHANNELS.MENU_PENDING]: {
    request: z.void(),
    response: MenuCommandSchema.nullable()
  }
} as const
