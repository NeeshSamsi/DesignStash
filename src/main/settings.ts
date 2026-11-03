import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

/**
 * App-level settings. These live in a FIXED location (Electron's userData) — outside the
 * managed library — because we must know where the library is before we can open it.
 * `libraryRoot` defaults to `<userData>/Library` but can be overridden (e.g. in onboarding).
 */
export interface AppSettings {
  libraryRoot: string
  onboarded: boolean
  activeModelId: string | null
  /** Telemetry consent — default ON (spec §13.3, pseudonymous). Nothing is sent until `onboarded`. */
  telemetryEnabled: boolean
  /** Pseudonymous, stable install identifier — generated once on first store init. */
  telemetryInstallId: string
  /**
   * A stash folder change waiting for a restart. At the next launch `libraryRoot` becomes `path`;
   * for a move, the old folder's contents are removed once the new copy is confirmed.
   */
  pendingStash: PendingStash | null
  /** The result of the last stash check (the launch scan or Check now). */
  stashCheck: StashCheckRecord | null
  /** When the app last looked for an update (ISO). */
  updatesCheckedAt: string | null
  /** Stash check items the user chose to ignore (opaque ids, no paths). */
  ignoredDrift: string[]
}

export interface PendingStash {
  path: string
  mode: 'move' | 'point'
  /** The folder the library was in when the change was made. */
  oldRoot: string
}

export interface StashCheckRecord {
  /** ISO time of the run. */
  at: string
  trigger: 'launch' | 'manual'
  result: 'in-sync' | 'review' | 'could-not-check'
  /** Orphan files plus orphan records found. 0 unless `result` is 'review'. */
  toReview: number
}

/** Something wrong with the settings file at launch. Only the fact and whether a backup was kept, never a path. */
export interface SettingsLoadIssue {
  kind: 'corrupt'
  backedUp: boolean
}

/** Seams for tests. */
export interface SettingsStoreOptions {
  now?: () => Date
  copyFile?: (from: string, to: string) => void
}

export interface SettingsStore {
  get(): AppSettings
  /** What was wrong with the file when this launch first read it, or null when it read clean. */
  loadIssue(): SettingsLoadIssue | null
  update(patch: Partial<AppSettings>): AppSettings
  getLibraryRoot(): string
}

/** Factory takes the userData dir explicitly so it stays free of `electron` and is unit-testable. */
export function createSettingsStore(
  userDataDir: string,
  options: SettingsStoreOptions = {}
): SettingsStore {
  const filePath = join(userDataDir, 'settings.json')
  const defaults: AppSettings = {
    libraryRoot: join(userDataDir, 'Library'),
    onboarded: false,
    activeModelId: null,
    telemetryEnabled: true,
    telemetryInstallId: '', // placeholder — a real UUID is minted on first init (see ensureInstallId)
    pendingStash: null,
    stashCheck: null,
    updatesCheckedAt: null,
    ignoredDrift: []
  }
  const now = options.now ?? (() => new Date())
  const copyFile = options.copyFile ?? copyFileSync
  let cache: AppSettings | null = null
  let issue: SettingsLoadIssue | null = null

  /** Keep the unreadable file next to the settings, never over an earlier backup. Returns whether it was kept. */
  function backUpCorruptFile(): boolean {
    const stamp = now().toISOString().replace(/[:.]/g, '-')
    for (let attempt = 0; attempt < 100; attempt++) {
      const suffix = attempt === 0 ? '' : `-${attempt}`
      const target = join(userDataDir, `settings.corrupt-${stamp}${suffix}.json`)
      if (existsSync(target)) continue
      try {
        copyFile(filePath, target)
        return true
      } catch {
        return false
      }
    }
    return false
  }

  function readFromDisk(): AppSettings {
    if (existsSync(filePath)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf-8'))
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return { ...defaults, ...(parsed as Partial<AppSettings>) }
        }
      } catch {
        // Fall through: unreadable is handled below.
      }
      // Corrupt settings: keep the file, then start again from defaults rather than crash.
      issue = { kind: 'corrupt', backedUp: backUpCorruptFile() }
      try {
        writeFileSync(filePath, JSON.stringify(defaults, null, 2), 'utf-8')
      } catch {
        // The reset is written again on the next update.
      }
    }
    return { ...defaults }
  }

  function get(): AppSettings {
    if (cache) return cache
    const loaded = readFromDisk()
    // Mint a stable pseudonymous install ID once, the first time it's missing, and persist it.
    if (!loaded.telemetryInstallId) {
      cache = update({ telemetryInstallId: randomUUID() }, loaded)
      return cache
    }
    cache = loaded
    return cache
  }

  // `base` lets the initial install-id mint write without re-entering get() (which would recurse).
  function update(patch: Partial<AppSettings>, base?: AppSettings): AppSettings {
    const next = { ...(base ?? get()), ...patch }
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf-8')
    cache = next
    return next
  }

  return {
    get,
    loadIssue: () => {
      get()
      return issue
    },
    update,
    getLibraryRoot: () => get().libraryRoot
  }
}
