import { release } from 'node:os'
import { app, clipboard, dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { buildReport } from '../app/report'
import { checkFolder, getBootStatus } from '../boot-status'
import type { Repository } from '../db/repository'
import type { SettingsStore } from '../settings'
import { registerIpcHandler } from './register'

export interface BootHandlerDeps {
  settings: SettingsStore
  /** The open library, or null when it failed to open. The report then leaves the counts out. */
  repo: Repository | null
  writeClipboard?: (text: string) => void
  version?: () => string
}

/**
 * Everything the screens before the app need: launch status, the folder check, settings, the
 * folder picker and the problem report. None of it needs a database, so this one set is
 * registered at launch whether or not the library opened, and no other module registers these
 * channels.
 */
export function registerBootHandlers({ settings, repo, ...deps }: BootHandlerDeps): void {
  const writeClipboard = deps.writeClipboard ?? ((text) => clipboard.writeText(text))
  const version = deps.version ?? (() => app.getVersion())

  registerIpcHandler(IPC_CHANNELS.BOOT_STATUS, () => {
    // The reply stays flat: backupKept is false outside settings-corrupt.
    const status = getBootStatus()
    return {
      state: status.state,
      backupKept: status.state === 'settings-corrupt' && status.backupKept
    }
  })

  registerIpcHandler(IPC_CHANNELS.BOOT_CHECK_FOLDER, (args) => checkFolder(args.path))

  registerIpcHandler(IPC_CHANNELS.SETTINGS_GET, () => settings.get())

  registerIpcHandler(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT, (args) => {
    // Persists the choice. Relocating an existing library + re-init applies on next launch
    // (full move/restart handled when onboarding lands).
    const next = settings.update({ libraryRoot: args.path })
    return { libraryRoot: next.libraryRoot }
  })

  registerIpcHandler(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    const path = result.canceled ? null : (result.filePaths[0] ?? null)
    return { path }
  })

  registerIpcHandler(IPC_CHANNELS.REPORT_COPY, () => {
    const counts = repo?.inbox.getCounts()
    writeClipboard(
      buildReport({
        version: version(),
        electron: process.versions.electron ?? 'unknown',
        platform: process.platform,
        arch: process.arch,
        osRelease: release(),
        stashCount: repo ? repo.library.getLibraryStats().total : null,
        toSort: counts?.toSort ?? null,
        toStash: counts?.toStash ?? null,
        trash: counts?.trash ?? null,
        stashCheck: settings.get().stashCheck?.result ?? 'not checked yet',
        aiModel: settings.get().activeModelId ?? 'none'
      })
    )
    return { copied: true }
  })
}
