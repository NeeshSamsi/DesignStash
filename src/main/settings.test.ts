import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSettingsStore } from './settings'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ds-settings-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('settings store', () => {
  it('defaults libraryRoot to <userData>/Library and onboarded=false', () => {
    const dir = tempDir()
    const store = createSettingsStore(dir)
    expect(store.getLibraryRoot()).toBe(join(dir, 'Library'))
    expect(store.get().onboarded).toBe(false)
  })

  it('persists updates to disk', () => {
    const dir = tempDir()
    const custom = join(dir, 'custom-library')
    createSettingsStore(dir).update({ libraryRoot: custom, onboarded: true })
    expect(existsSync(join(dir, 'settings.json'))).toBe(true)
  })

  it('a fresh store reads back persisted values', () => {
    const dir = tempDir()
    const custom = join(dir, 'custom-library')
    createSettingsStore(dir).update({ libraryRoot: custom, onboarded: true })
    const reloaded = createSettingsStore(dir)
    expect(reloaded.getLibraryRoot()).toBe(custom)
    expect(reloaded.get().onboarded).toBe(true)
  })

  it('getLibraryRoot() is a convenience alias for get().libraryRoot', () => {
    const dir = tempDir()
    const store = createSettingsStore(dir)
    expect(store.getLibraryRoot()).toBe(store.get().libraryRoot)
  })

  it('falls back to defaults when settings.json is corrupt JSON', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'settings.json'), '{ not valid json !!!', 'utf-8')
    const store = createSettingsStore(dir)
    expect(store.getLibraryRoot()).toBe(join(dir, 'Library'))
    expect(store.get().onboarded).toBe(false)
  })

  it('merges partial settings file with defaults', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ onboarded: true }), 'utf-8')
    const store = createSettingsStore(dir)
    // libraryRoot absent from file — should fall back to default
    expect(store.getLibraryRoot()).toBe(join(dir, 'Library'))
    expect(store.get().onboarded).toBe(true)
  })

  it('update() is additive — unmentioned fields keep their current values', () => {
    const dir = tempDir()
    const custom = join(dir, 'custom')
    const store = createSettingsStore(dir)
    store.update({ libraryRoot: custom })
    store.update({ onboarded: true })
    expect(store.getLibraryRoot()).toBe(custom)
    expect(store.get().onboarded).toBe(true)
  })
})
