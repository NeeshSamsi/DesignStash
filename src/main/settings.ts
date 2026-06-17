import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
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
}

export interface SettingsStore {
  get(): AppSettings
  update(patch: Partial<AppSettings>): AppSettings
  getLibraryRoot(): string
}

/** Factory takes the userData dir explicitly so it stays free of `electron` and is unit-testable. */
export function createSettingsStore(userDataDir: string): SettingsStore {
  const filePath = join(userDataDir, 'settings.json')
  const defaults: AppSettings = {
    libraryRoot: join(userDataDir, 'Library'),
    onboarded: false,
    activeModelId: null,
    telemetryEnabled: true,
    telemetryInstallId: '' // placeholder — a real UUID is minted on first init (see ensureInstallId)
  }
  let cache: AppSettings | null = null

  function readFromDisk(): AppSettings {
    if (existsSync(filePath)) {
      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<AppSettings>
        return { ...defaults, ...parsed }
      } catch {
        // Corrupt settings — fall back to defaults rather than crash.
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

  return { get, update, getLibraryRoot: () => get().libraryRoot }
}
