import { join } from 'node:path'
import type { App } from 'electron'

/** Dev's data folder in Application Support. It also holds dev's models, helper and llama-server. */
export const DEV_USER_DATA = 'DesignStash-dev'

export type DevUserDataApp = Pick<App, 'isPackaged' | 'setPath'> & {
  commandLine: Pick<App['commandLine'], 'hasSwitch'>
  getPath: (name: 'appData') => string
}

/**
 * Dev keeps its own data folder, so it never shares a library, settings or the single-instance lock
 * with the installed app, whose `DesignStash` folder is the same one as dev's `designstash` on a
 * case-insensitive disk. An explicit --user-data-dir (e2e, the seed tool) wins. Call it before
 * anything reads userData: the crash reporter, the single-instance lock, ready.
 */
export function applyDevUserData(app: DevUserDataApp): void {
  if (app.isPackaged || app.commandLine.hasSwitch('user-data-dir')) return
  app.setPath('userData', join(app.getPath('appData'), DEV_USER_DATA))
}
