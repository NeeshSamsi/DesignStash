import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../../src/main/db/schema'
import { Repository } from '../../src/main/db/repository'
import { liveSingleton, moveDevLibrary, type MoveOptions } from './move'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** An Application Support folder holding the shared `designstash` folder, dev's own, and a tmp/. */
function setup(opts: { libraryRoot?: (shared: string, home: string) => string } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'ds-move-'))
  dirs.push(home)
  const support = join(home, 'Application Support')
  const shared = join(support, 'designstash')
  const dev = join(support, 'DesignStash-dev')
  const stash = opts.libraryRoot ? opts.libraryRoot(shared, home) : join(shared, 'Library')
  mkdirSync(shared, { recursive: true })
  mkdirSync(join(stash, 'mockups', 'a'), { recursive: true })
  writeFileSync(join(stash, 'mockups', 'a', 'original.psd'), 'psd')
  // The library's database, migrated, with one mockup whose paths point into the stash.
  const sqlite = new Database(join(stash, 'designstash.db'))
  migrate(drizzle(sqlite, { schema }), { migrationsFolder: './drizzle' })
  new Repository(drizzle(sqlite, { schema })).mockups.createMockup({
    title: 'Tote',
    libraryPath: join(stash, 'mockups', 'a', 'original.psd'),
    coverPath: join(stash, 'mockups', 'a', 'cover.png'),
    coverSource: 'embedded'
  })
  sqlite.close()
  writeFileSync(
    join(shared, 'settings.json'),
    JSON.stringify({
      libraryRoot: stash,
      onboarded: true,
      pendingStash: null,
      activeModelId: 'qwen3.5-9b'
    })
  )
  writeFileSync(join(shared, 'stash-root'), stash)
  mkdirSync(join(shared, 'logs'))
  writeFileSync(join(shared, 'logs', 'designstash.log'), 'lines')
  // Dev's folder already holds its models and llama-server.
  mkdirSync(join(dev, 'models', 'qwen3.5-9b'), { recursive: true })
  writeFileSync(join(dev, 'models', 'qwen3.5-9b', 'model.gguf'), 'dev weights')
  mkdirSync(join(dev, 'llama-server', 'current'), { recursive: true })
  const options: MoveOptions = {
    from: shared,
    to: dev,
    backupDir: join(home, 'tmp', 'backup'),
    busy: () => null,
    log: () => {}
  }
  return { home, shared, dev, stash, options }
}

const pathsIn = (dbPath: string): string[] => {
  const db = new Database(dbPath, { readonly: true })
  try {
    return db.prepare('SELECT library_path, cover_path FROM mockups').raw().all().flat() as string[]
  } finally {
    db.close()
  }
}

describe('moveDevLibrary', () => {
  it('moves the settings and the library into DesignStash-dev, with every path pointing there', () => {
    const { shared, dev, options } = setup()

    expect(moveDevLibrary(options)).toEqual({ moved: true, libraryRoot: join(dev, 'Library') })

    const settings = JSON.parse(readFileSync(join(dev, 'settings.json'), 'utf8'))
    expect(settings).toMatchObject({
      libraryRoot: join(dev, 'Library'),
      onboarded: true,
      activeModelId: 'qwen3.5-9b'
    })
    expect(readFileSync(join(dev, 'stash-root'), 'utf8')).toBe(join(dev, 'Library'))
    expect(existsSync(join(dev, 'Library', 'mockups', 'a', 'original.psd'))).toBe(true)
    expect(existsSync(join(dev, 'logs', 'designstash.log'))).toBe(true)
    expect(pathsIn(join(dev, 'Library', 'designstash.db'))).toEqual([
      join(dev, 'Library', 'mockups', 'a', 'original.psd'),
      join(dev, 'Library', 'mockups', 'a', 'cover.png')
    ])
    // The installed app's folder starts fresh.
    expect(existsSync(shared)).toBe(false)
  })

  it('takes a backup of the shared folder first', () => {
    const { home, options } = setup()
    moveDevLibrary(options)
    const backup = join(home, 'tmp', 'backup', 'designstash')
    expect(JSON.parse(readFileSync(join(backup, 'settings.json'), 'utf8')).onboarded).toBe(true)
    expect(existsSync(join(backup, 'Library', 'designstash.db'))).toBe(true)
  })

  it('keeps the models dev already has and adds the ones it lacks', () => {
    const { shared, dev, options } = setup()
    mkdirSync(join(shared, 'models', 'qwen3.5-9b'), { recursive: true })
    writeFileSync(join(shared, 'models', 'qwen3.5-9b', 'model.gguf'), 'shared weights')
    mkdirSync(join(shared, 'models', 'qwen3-vl-4b'), { recursive: true })
    writeFileSync(join(shared, 'models', 'qwen3-vl-4b', 'model.gguf'), '4b weights')

    moveDevLibrary(options)

    expect(readFileSync(join(dev, 'models', 'qwen3.5-9b', 'model.gguf'), 'utf8')).toBe(
      'dev weights'
    )
    expect(readFileSync(join(dev, 'models', 'qwen3-vl-4b', 'model.gguf'), 'utf8')).toBe(
      '4b weights'
    )
    expect(existsSync(join(dev, 'llama-server', 'current'))).toBe(true)
  })

  it('refuses while an app is running, and changes nothing', () => {
    const { shared, dev, options } = setup()
    const result = moveDevLibrary({
      ...options,
      busy: () => 'the installed DesignStash is running'
    })
    expect(result).toEqual({ moved: false, reason: 'the installed DesignStash is running' })
    expect(existsSync(join(shared, 'settings.json'))).toBe(true)
    expect(existsSync(join(dev, 'settings.json'))).toBe(false)
    expect(existsSync(options.backupDir)).toBe(false)
  })

  it('asks whether anything has the library’s database open', () => {
    const { stash, options } = setup()
    const busy = vi.fn(() => null)
    moveDevLibrary({ ...options, busy })
    expect(busy).toHaveBeenCalledWith([options.from, options.to], join(stash, 'designstash.db'))
  })

  it('refuses when dev already has settings of its own', () => {
    const { shared, dev, options } = setup()
    writeFileSync(join(dev, 'settings.json'), '{}')
    expect(moveDevLibrary(options).moved).toBe(false)
    expect(existsSync(join(shared, 'settings.json'))).toBe(true)
  })

  it('leaves a stash folder outside the shared folder where it is', () => {
    const { dev, stash, options } = setup({
      libraryRoot: (_shared, home) => join(home, 'Documents', 'DesignStash')
    })

    expect(moveDevLibrary(options)).toEqual({ moved: true, libraryRoot: stash })

    expect(JSON.parse(readFileSync(join(dev, 'settings.json'), 'utf8')).libraryRoot).toBe(stash)
    expect(pathsIn(join(stash, 'designstash.db'))[0]).toBe(
      join(stash, 'mockups', 'a', 'original.psd')
    )
  })

  it('finds the stash inside the shared folder whatever case its path was written in', () => {
    const { shared, dev, options } = setup({
      libraryRoot: (shared) => join(shared.replace(/designstash$/, 'DesignStash'), 'Library')
    })

    expect(moveDevLibrary(options)).toEqual({ moved: true, libraryRoot: join(dev, 'Library') })
    expect(pathsIn(join(dev, 'Library', 'designstash.db'))[0]).toBe(
      join(dev, 'Library', 'mockups', 'a', 'original.psd')
    )
    expect(existsSync(shared)).toBe(false)
  })
})

describe('liveSingleton', () => {
  it('names the running process that holds a folder’s single-instance lock', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-singleton-'))
    dirs.push(dir)
    symlinkSync(`studio-mac-${process.pid}`, join(dir, 'SingletonLock'))
    expect(liveSingleton(dir)).toBe(process.pid)
  })

  it('ignores a lock left by a process that is gone, and a folder with none', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-singleton-'))
    dirs.push(dir)
    expect(liveSingleton(dir)).toBeNull()
    symlinkSync('studio-mac-999999', join(dir, 'SingletonLock'))
    expect(liveSingleton(dir)).toBeNull()
  })
})
