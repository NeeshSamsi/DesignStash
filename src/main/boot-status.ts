import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { SettingsStore } from './settings'

/** What launch found. `library-failed` is the worst: nothing past the launch screen can run. */
export type BootState = 'ok' | 'library-failed' | 'folder-unavailable' | 'settings-corrupt'

export type BootStatus =
  | { state: 'ok' | 'library-failed' | 'folder-unavailable' }
  /** The settings file was unreadable and reset; `backupKept` says whether a copy was saved. */
  | { state: 'settings-corrupt'; backupKept: boolean }

/** Whether the database opened. Both `ok` and `settings-corrupt` mean it did. */
export function isLibraryOpen(status: BootStatus): boolean {
  return status.state === 'ok' || status.state === 'settings-corrupt'
}

/** A folder the user is about to use as their stash, or the one they already use. */
export interface FolderCheck {
  state: 'ok' | 'missing' | 'not-writable'
  /** There is already a DesignStash library in it, so onboarding can offer to use it. */
  hasLibrary: boolean
}

const DATABASE_FILE = 'designstash.db'

export function checkFolder(path: string): FolderCheck {
  if (!isAbsolute(path) || !existsSync(path) || !statSync(path).isDirectory()) {
    return { state: 'missing', hasLibrary: false }
  }
  const hasLibrary = existsSync(join(path, DATABASE_FILE))
  try {
    accessSync(path, constants.W_OK)
  } catch {
    return { state: 'not-writable', hasLibrary }
  }
  return { state: 'ok', hasLibrary }
}

/**
 * Decide what launch looks like. `openLibrary` creates the folders, opens the database and runs
 * migrations; it is only called when the stash folder is usable. Order of severity: the folder is
 * unavailable, then the library fails to open, then the settings file was corrupt.
 *
 * Once someone has been through onboarding, a stash folder that is gone (a drive unplugged, a
 * folder moved) is reported and never recreated behind their back. Nothing here carries a path or
 * an error message: the renderer only learns the state.
 */
export function runBoot(
  settings: SettingsStore,
  openLibrary: () => void,
  /** For the log only. The error never reaches the renderer. */
  onError: (err: unknown) => void = () => {}
): BootStatus {
  const issue = settings.loadIssue()
  const { onboarded } = settings.get()
  const folder = checkFolder(settings.getLibraryRoot())

  const unusable = onboarded ? folder.state !== 'ok' : folder.state === 'not-writable'
  if (unusable) return { state: 'folder-unavailable' }

  try {
    openLibrary()
  } catch (err) {
    onError(err)
    return { state: 'library-failed' }
  }

  if (issue) return { state: 'settings-corrupt', backupKept: issue.backedUp }
  return { state: 'ok' }
}

let current: BootStatus = { state: 'ok' }

/** Set once by the launch code; read by the `boot:status` handler. */
export function setBootStatus(status: BootStatus): void {
  current = status
}

export function getBootStatus(): BootStatus {
  return current
}
