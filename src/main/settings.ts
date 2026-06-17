import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'

/**
 * App-level settings. These live in a FIXED location (Electron's userData) — outside the
 * managed library — because we must know where the library is before we can open it.
 * `libraryRoot` defaults to `<userData>/Library` but can be overridden (e.g. in onboarding).
 */
export interface AppSettings {
  libraryRoot: string
  onboarded: boolean
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
    onboarded: false
  }
  let cache: AppSettings | null = null

  function get(): AppSettings {
    if (cache) return cache
    if (existsSync(filePath)) {
      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<AppSettings>
        cache = { ...defaults, ...parsed }
        return cache
      } catch {
        // Corrupt settings — fall back to defaults rather than crash.
      }
    }
    cache = { ...defaults }
    return cache
  }

  function update(patch: Partial<AppSettings>): AppSettings {
    const next = { ...get(), ...patch }
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf-8')
    cache = next
    return next
  }

  return { get, update, getLibraryRoot: () => get().libraryRoot }
}
