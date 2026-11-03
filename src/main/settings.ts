import { isAbsolute, join } from 'node:path'
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { checkFolder } from './boot-status'

/**
 * App-level settings. These live in a FIXED location (Electron's userData) — outside the
 * managed library — because we must know where the library is before we can open it.
 * `libraryRoot` defaults to `<userData>/Library` but can be overridden (e.g. in onboarding).
 */
export interface AppSettings {
  libraryRoot: string
  onboarded: boolean
  activeModelId: string | null
  /**
   * Usage-data consent. On by default for a new install (opt-out): onboarding says so plainly and
   * the switch sits right there. Nothing is sent until `onboarded`. An existing file keeps its choice.
   */
  telemetryEnabled: boolean
  /** Pseudonymous, stable install identifier — generated once on first store init. */
  telemetryInstallId: string
  /** When this install first ran (ISO), minted with the install id. Only ever sent as a time since. */
  installedAt: string
  /** Set once `first_suggestion` has been sent, so it is sent once. */
  firstSuggestionSentAt: string | null
  /**
   * A stash folder change waiting for a restart. At the next launch `libraryRoot` becomes `path`;
   * for a move, the old folder's contents are removed once the new copy is confirmed.
   */
  pendingStash: PendingStash | null
  /** The result of the last stash check (the launch scan or Check now). */
  stashCheck: StashCheckRecord | null
  /** When the app last looked for an update (ISO). */
  updatesCheckedAt: string | null
  /** The newest release the last successful check found, kept so a throttled launch can still report it. */
  updatesLatest: { version: string; notes: string; releaseUrl: string } | null
  /** Stash check items the user chose to ignore (opaque ids, no paths). */
  ignoredDrift: string[]
  /** This Mac's recent suggestion times per model (ms), for when one is "taking a while" (`run-timing.ts`). */
  aiRunTimes: Record<string, number[]>
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
  /** Writes one whole file. The store writes beside the real file with it, then renames over. */
  writeFile?: (path: string, data: string) => void
}

export interface SettingsStore {
  get(): AppSettings
  /** What was wrong with the file when this launch first read it, or null when it read clean. */
  loadIssue(): SettingsLoadIssue | null
  update(patch: Partial<AppSettings>): AppSettings
  getLibraryRoot(): string
}

/** Writes the file and flushes it to disk before it is renamed into place. */
function writeDurably(path: string, data: string): void {
  const fd = openSync(path, 'w')
  try {
    writeSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
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
    telemetryInstallId: '', // placeholder — a real UUID is minted on first init (see get)
    installedAt: '',
    firstSuggestionSentAt: null,
    pendingStash: null,
    stashCheck: null,
    updatesCheckedAt: null,
    updatesLatest: null,
    ignoredDrift: [],
    aiRunTimes: {}
  }
  const now = options.now ?? (() => new Date())
  const copyFile = options.copyFile ?? copyFileSync
  const writeFile = options.writeFile ?? writeDurably
  // The stash folder on its own, so an unreadable settings file never loses where the library is.
  const stashNotePath = join(userDataDir, 'stash-root')
  let cache: AppSettings | null = null
  let issue: SettingsLoadIssue | null = null
  /** What the stash note holds, once read. */
  let notedStash: string | null | undefined

  /** Writes beside the file, then renames over it: a crash part-way leaves the old file whole. */
  function save(path: string, data: string): void {
    const temp = `${path}.tmp`
    try {
      writeFile(temp, data)
    } catch (err) {
      rmSync(temp, { force: true })
      throw err
    }
    renameSync(temp, path)
  }

  function readStashNote(): string | null {
    try {
      const path = readFileSync(stashNotePath, 'utf-8').trim()
      return isAbsolute(path) ? path : null
    } catch {
      return null
    }
  }

  function noteStash(libraryRoot: string): void {
    if (notedStash === undefined) notedStash = readStashNote()
    if (notedStash === libraryRoot) return
    try {
      save(stashNotePath, libraryRoot)
      notedStash = libraryRoot
    } catch {
      // Written again with the next settings change.
    }
  }

  /** The stash folder from the note, when a library is still there. */
  function recoveredStash(): string | null {
    const path = readStashNote()
    return path && checkFolder(path).hasLibrary ? path : null
  }

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
      // Corrupt settings: keep the file, then start again from defaults rather than crash. The
      // stash folder comes back from its note, so the library opens where it was.
      issue = { kind: 'corrupt', backedUp: backUpCorruptFile() }
      const stash = recoveredStash()
      const reset = stash ? { ...defaults, libraryRoot: stash } : { ...defaults }
      try {
        save(filePath, JSON.stringify(reset, null, 2))
      } catch {
        // The reset is written again on the next update.
      }
      return reset
    }
    return { ...defaults }
  }

  function get(): AppSettings {
    if (cache) return cache
    const loaded = readFromDisk()
    // Mint a stable pseudonymous install ID once, the first time it's missing, and persist it.
    if (!loaded.telemetryInstallId || !loaded.installedAt) {
      cache = update(
        {
          telemetryInstallId: loaded.telemetryInstallId || randomUUID(),
          installedAt: loaded.installedAt || now().toISOString()
        },
        loaded
      )
      return cache
    }
    cache = loaded
    noteStash(loaded.libraryRoot)
    return cache
  }

  // `base` lets the initial install-id mint write without re-entering get() (which would recurse).
  function update(patch: Partial<AppSettings>, base?: AppSettings): AppSettings {
    const next = { ...(base ?? get()), ...patch }
    mkdirSync(userDataDir, { recursive: true })
    save(filePath, JSON.stringify(next, null, 2))
    cache = next
    noteStash(next.libraryRoot)
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
