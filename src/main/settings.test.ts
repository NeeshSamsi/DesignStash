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

  it('activeModelId defaults to null', () => {
    const store = createSettingsStore(tempDir())
    expect(store.get().activeModelId).toBeNull()
  })

  it('activeModelId persists to disk and reloads', () => {
    const dir = tempDir()
    createSettingsStore(dir).update({ activeModelId: 'moondream2-q4' })
    const reloaded = createSettingsStore(dir)
    expect(reloaded.get().activeModelId).toBe('moondream2-q4')
  })

  it('activeModelId can be cleared back to null', () => {
    const dir = tempDir()
    const store = createSettingsStore(dir)
    store.update({ activeModelId: 'moondream2-q4' })
    store.update({ activeModelId: null })
    expect(store.get().activeModelId).toBeNull()
  })

  it('telemetryEnabled defaults to true and install ID is non-empty', () => {
    const store = createSettingsStore(tempDir())
    expect(store.get().telemetryEnabled).toBe(true)
    expect(store.get().telemetryInstallId).toBeTruthy()
    expect(typeof store.get().telemetryInstallId).toBe('string')
  })

  it('telemetryInstallId is generated once and stable across re-reads', () => {
    const dir = tempDir()
    const first = createSettingsStore(dir).get().telemetryInstallId
    expect(first).toBeTruthy()
    // A fresh store reading the same dir must see the same persisted ID.
    const reloaded = createSettingsStore(dir).get().telemetryInstallId
    expect(reloaded).toBe(first)
  })

  it('update({ telemetryEnabled: false }) persists and reloads as false', () => {
    const dir = tempDir()
    createSettingsStore(dir).update({ telemetryEnabled: false })
    const reloaded = createSettingsStore(dir)
    expect(reloaded.get().telemetryEnabled).toBe(false)
  })

  it('starts with no pending stash change, no stash check and no update check', () => {
    const store = createSettingsStore(tempDir())
    expect(store.get()).toMatchObject({ pendingStash: null, stashCheck: null, updatesCheckedAt: null })
  })

  it('keeps a pending stash change and a stash check across a restart', () => {
    const dir = tempDir()
    createSettingsStore(dir).update({
      pendingStash: { path: '/new', mode: 'move', oldRoot: '/old' },
      stashCheck: { at: '2026-10-20T02:41:00.000Z', trigger: 'launch', result: 'in-sync', toReview: 0 }
    })
    expect(createSettingsStore(dir).get()).toMatchObject({
      pendingStash: { path: '/new', mode: 'move', oldRoot: '/old' },
      stashCheck: { trigger: 'launch', result: 'in-sync' }
    })
  })
})
