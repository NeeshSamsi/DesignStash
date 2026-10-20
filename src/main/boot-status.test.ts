import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSettingsStore } from './settings'
import { checkFolder, getBootStatus, runBoot, setBootStatus } from './boot-status'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ds-boot-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  setBootStatus({ state: 'ok', backupKept: false })
  for (const dir of dirs.splice(0)) {
    try {
      chmodSync(dir, 0o700)
    } catch {
      // Already gone.
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('checkFolder', () => {
  it('is ok for a folder we can write to, with no library in it', () => {
    expect(checkFolder(tempDir())).toEqual({ state: 'ok', hasLibrary: false })
  })

  it('finds an existing library by its database', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'designstash.db'), '')
    expect(checkFolder(dir)).toEqual({ state: 'ok', hasLibrary: true })
  })

  it('says missing for a folder that is not there', () => {
    expect(checkFolder(join(tempDir(), 'nope'))).toEqual({ state: 'missing', hasLibrary: false })
  })

  it('says missing for a path that is a file', () => {
    const dir = tempDir()
    const file = join(dir, 'a.txt')
    writeFileSync(file, 'x')
    expect(checkFolder(file).state).toBe('missing')
  })

  it('says not-writable for a read-only folder, and still sees the library in it', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'designstash.db'), '')
    chmodSync(dir, 0o500)
    expect(checkFolder(dir)).toEqual({ state: 'not-writable', hasLibrary: true })
  })

  it('treats a relative path as missing', () => {
    expect(checkFolder('relative/folder').state).toBe('missing')
  })
})

describe('runBoot', () => {
  const noop = (): void => {}

  it('is ok on a first launch, and creates the default library folder through the callback', () => {
    const dir = tempDir()
    const settings = createSettingsStore(dir)
    let initialised = false
    const status = runBoot(settings, () => {
      initialised = true
    })
    expect(status).toEqual({ state: 'ok', backupKept: false })
    expect(initialised).toBe(true)
  })

  it('is ok on a later launch with the folder in place', () => {
    const dir = tempDir()
    const library = join(dir, 'lib')
    mkdirSync(library)
    const settings = createSettingsStore(dir)
    settings.update({ libraryRoot: library, onboarded: true })
    expect(runBoot(settings, noop).state).toBe('ok')
  })

  it('reports folder-unavailable when the stash folder has gone, and does not recreate it', () => {
    const dir = tempDir()
    const library = join(dir, 'unplugged-drive', 'Library')
    const settings = createSettingsStore(dir)
    settings.update({ libraryRoot: library, onboarded: true })
    let initialised = false
    const status = runBoot(settings, () => {
      initialised = true
    })
    expect(status.state).toBe('folder-unavailable')
    expect(initialised).toBe(false)
    expect(existsSync(library)).toBe(false)
  })

  it('reports folder-unavailable when the stash folder cannot be written to', () => {
    const dir = tempDir()
    const library = join(dir, 'lib')
    mkdirSync(library)
    chmodSync(library, 0o500)
    const settings = createSettingsStore(dir)
    settings.update({ libraryRoot: library, onboarded: true })
    expect(runBoot(settings, noop).state).toBe('folder-unavailable')
  })

  it('reports library-failed when opening the library throws, with no message passed on', () => {
    const dir = tempDir()
    const settings = createSettingsStore(dir)
    const status = runBoot(settings, () => {
      throw new Error(`cannot open ${dir}/designstash.db`)
    })
    expect(status).toEqual({ state: 'library-failed', backupKept: false })
    expect(JSON.stringify(status)).not.toContain(dir)
  })

  it('reports settings-corrupt after backing the file up, and still opens the library', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'settings.json'), '{ nope', 'utf-8')
    const settings = createSettingsStore(dir)
    let initialised = false
    const status = runBoot(settings, () => {
      initialised = true
    })
    expect(status).toEqual({ state: 'settings-corrupt', backupKept: true })
    expect(initialised).toBe(true)
  })

  it('puts library-failed ahead of settings-corrupt, and folder-unavailable ahead of both', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'settings.json'), '{ nope', 'utf-8')
    const failing = runBoot(createSettingsStore(dir), () => {
      throw new Error('boom')
    })
    expect(failing.state).toBe('library-failed')
  })
})

describe('boot status holder', () => {
  it('starts ok and holds what was set', () => {
    expect(getBootStatus()).toEqual({ state: 'ok', backupKept: false })
    setBootStatus({ state: 'library-failed', backupKept: false })
    expect(getBootStatus().state).toBe('library-failed')
  })
})

describe('runBoot logging', () => {
  it('hands the failure to the log callback only', () => {
    const settings = createSettingsStore(tempDir())
    const seen: unknown[] = []
    const status = runBoot(
      settings,
      () => {
        throw new Error('boom')
      },
      (err) => seen.push(err)
    )
    expect(seen).toHaveLength(1)
    expect(status.state).toBe('library-failed')
  })
})
