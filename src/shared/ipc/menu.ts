import { z } from 'zod'

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
  'report-problem'
])
export type MenuCommand = z.infer<typeof MenuCommandSchema>
