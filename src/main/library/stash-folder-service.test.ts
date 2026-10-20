import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { StashMoveProgress } from '@shared/stash'
import { createSettingsStore, type SettingsStore } from '../settings'
import { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { applyPendingStash, StashFolderService, type StashFolderDeps } from './stash-folder-service'

let base: string
let root: string
let settings: SettingsStore
let repo: Repository
let sqlite: Database.Database
let progress: StashMoveProgress[]

/** Backup that just writes a real SQLite file with one mockup row, like the live database copy. */
const makeDeps = (over: Partial<StashFolderDeps> = {}): Partial<StashFolderDeps> => ({
  backupDb: async (dest) => {
    const db = new Database(dest)
    db.exec(
      `CREATE TABLE mockups (id integer primary key, library_path text, cover_path text);
       CREATE TABLE variants (id integer primary key, library_path text, cover_path text);
       INSERT INTO mockups VALUES (1, '${root}/mockups/a/original.psd', '${root}/mockups/a/cover.webp'),
                                  (2, '/elsewhere/keep.psd', '${root}/covers/2/cover.webp');`
    )
    db.close()
  },
  freeBytes: async () => 10_000_000,
  ...over
})

const write = (path: string, content: string) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'ds-stash-'))
  root = join(base, 'Library')
  settings = createSettingsStore(base)
  settings.update({ libraryRoot: root })
  write(join(root, 'designstash.db'), 'old-db')
  write(join(root, 'config.json'), '{"version":1}')
  write(join(root, 'mockups', 'a', 'original.psd'), 'psd-a-1234')
  write(join(root, 'mockups', 'a', 'cover.webp'), 'cover-a')
  write(join(root, 'covers', '2', 'cover.webp'), 'cover-2')
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  progress = []
})

afterEach(() => {
  sqlite.close()
  rmSync(base, { recursive: true, force: true })
})

const service = (over: Partial<StashFolderDeps> = {}) =>
  new StashFolderService(repo, settings, makeDeps(over), (p) => progress.push(p))

const tree = (dir: string, prefix = ''): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tree(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]
  )

describe('info', () => {
  it('reports the folder, how many mockups are in it and their size', async () => {
    const a = repo.mockups.createMockup(approvedMockup({ title: 'a', libraryPath: join(root, 'mockups/a/original.psd') }))
    repo.mockups.createMockup(approvedMockup({ title: 'b', libraryPath: join(root, 'mockups/b/original.psd') }))
    repo.mockups.updateMockup(a.id, { sizeBytes: 1000 })
    const gone = repo.mockups.createMockup(approvedMockup({ title: 'c', libraryPath: join(root, 'mockups/c/original.psd') }))
    repo.trash.moveToTrash(gone.id)

    const info = await service({ stat: async () => ({ size: 500 }) }).info()

    expect(info).toEqual({ path: root, count: 2, bytes: 1500, restartRequired: false })
  })

  it('shows the new folder and asks for a restart once a change is waiting', async () => {
    settings.update({ pendingStash: { path: '/new/place', mode: 'point', oldRoot: root } })
    expect(await service().info()).toMatchObject({ path: '/new/place', restartRequired: true })
  })
})

describe('change: move', () => {
  it('copies the stash, rewrites the paths in the copy and waits for a restart', async () => {
    const target = join(base, 'Moved')

    const result = await service().change(target, 'move')

    expect(result).toEqual({ ok: true, restartRequired: true })
    expect(tree(target).sort()).toEqual(
      ['config.json', 'covers/2/cover.webp', 'designstash.db', 'mockups/a/cover.webp', 'mockups/a/original.psd'].sort()
    )
    expect(readFileSync(join(target, 'mockups/a/original.psd'), 'utf8')).toBe('psd-a-1234')
    const copied = new Database(join(target, 'designstash.db'), { readonly: true })
    expect(copied.prepare('SELECT library_path, cover_path FROM mockups ORDER BY id').all()).toEqual([
      { library_path: `${target}/mockups/a/original.psd`, cover_path: `${target}/mockups/a/cover.webp` },
      { library_path: '/elsewhere/keep.psd', cover_path: `${target}/covers/2/cover.webp` }
    ])
    copied.close()
    expect(settings.get().pendingStash).toEqual({ path: target, mode: 'move', oldRoot: root })
  })

  it('leaves the original folder exactly as it was, even after a successful move', async () => {
    const before = tree(root).sort()
    await service().change(join(base, 'Moved'), 'move')
    expect(tree(root).sort()).toEqual(before)
    expect(readFileSync(join(root, 'designstash.db'), 'utf8')).toBe('old-db')
    expect(settings.getLibraryRoot()).toBe(root)
  })

  it('reports progress by files and bytes, ending with everything copied', async () => {
    await service().change(join(base, 'Moved'), 'move')

    expect(progress.length).toBeGreaterThan(2)
    expect(progress[0]).toMatchObject({ phase: 'copying', copiedFiles: 0 })
    const last = progress.at(-1)!
    expect(last.phase).toBe('finishing')
    expect(last.copiedFiles).toBe(last.totalFiles)
    expect(last.copiedBytes).toBe(last.totalBytes)
    expect(progress.some((p) => p.phase === 'verifying')).toBe(true)
  })

  it('moves into an empty existing folder', async () => {
    const target = join(base, 'EmptyAlready')
    mkdirSync(target)
    write(join(target, '.DS_Store'), 'x')

    expect(await service().change(target, 'move')).toEqual({ ok: true, restartRequired: true })
  })

  it('refuses a folder with things in it, and touches nothing', async () => {
    const target = join(base, 'Busy')
    write(join(target, 'notes.txt'), 'mine')

    expect(await service().change(target, 'move')).toEqual({ ok: false, reason: 'not-empty' })
    expect(tree(target)).toEqual(['notes.txt'])
    expect(settings.get().pendingStash).toBeNull()
  })

  it.each([
    ['the same folder', () => root, 'same-folder'],
    ['a folder inside the stash', () => join(root, 'inner'), 'inside-stash'],
    ['a file', () => join(base, 'config-file'), 'not-a-folder']
  ])('refuses %s', async (_name, target, reason) => {
    write(join(base, 'config-file'), 'x')
    expect(await service().change(target(), 'move')).toEqual({ ok: false, reason })
    expect(settings.get().pendingStash).toBeNull()
  })

  it('refuses when there is not enough room, before copying anything', async () => {
    const target = join(base, 'Tight')
    const result = await service({ freeBytes: async () => 5 }).change(target, 'move')

    expect(result).toEqual({ ok: false, reason: 'no-space' })
    expect(existsSync(target)).toBe(false)
  })

  it('cleans up what it wrote when a copy fails, and keeps the original', async () => {
    const target = join(base, 'Failing')
    let copies = 0
    const result = await service({
      copyFile: async (src, dest) => {
        if (++copies === 3) throw new Error('disk went away')
        writeFileSync(dest, readFileSync(src))
      }
    }).change(target, 'move')

    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(existsSync(target)).toBe(false)
    expect(tree(root).length).toBe(5)
    expect(settings.get().pendingStash).toBeNull()
  })

  it('does not remove a folder it did not create when cleaning up', async () => {
    const target = join(base, 'KeepMe')
    mkdirSync(target)
    const result = await service({
      copyFile: async () => {
        throw new Error('nope')
      }
    }).change(target, 'move')

    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(existsSync(target)).toBe(true)
    expect(readdirSync(target)).toEqual([])
  })

  it('fails the move when the copy does not match the original in count and size', async () => {
    const target = join(base, 'Short')
    const result = await service({
      copyFile: async (src, dest) => writeFileSync(dest, readFileSync(src).subarray(0, 2))
    }).change(target, 'move')

    expect(result).toEqual({ ok: false, reason: 'verify-failed' })
    expect(existsSync(target)).toBe(false)
    expect(settings.get().pendingStash).toBeNull()
  })

  it('reports not-writable when the folder cannot be created', async () => {
    const result = await service({
      mkdir: async () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' })
      }
    }).change(join(base, 'Denied'), 'move')
    expect(result).toEqual({ ok: false, reason: 'not-writable' })
  })

  it('never puts a path or system message in a failure', async () => {
    const result = await service({
      copyFile: async () => {
        throw new Error(`ENOSPC at ${root}/mockups/a/original.psd`)
      }
    }).change(join(base, 'X'), 'move')
    expect(JSON.stringify(result)).not.toContain(base)
  })
})

describe('change: point', () => {
  it('only records the folder and moves nothing', async () => {
    const existing = join(base, 'Other stash')
    mkdirSync(existing)
    write(join(existing, 'designstash.db'), 'theirs')

    expect(await service().change(existing, 'point')).toEqual({ ok: true, restartRequired: true })

    expect(settings.get().pendingStash).toEqual({ path: existing, mode: 'point', oldRoot: root })
    expect(tree(existing)).toEqual(['designstash.db'])
  })

  it('refuses a folder that does not exist, or is the current one', async () => {
    expect(await service().change(join(base, 'nope'), 'point')).toEqual({ ok: false, reason: 'not-a-folder' })
    expect(await service().change(root, 'point')).toEqual({ ok: false, reason: 'same-folder' })
  })
})

describe('applyPendingStash (at the next launch)', () => {
  it('switches to the new folder after a move and clears out the old one', async () => {
    const target = join(base, 'Moved')
    await service().change(target, 'move')
    const kept = join(root, 'my-own-notes.txt')
    writeFileSync(kept, 'not ours')

    applyPendingStash(settings)

    expect(settings.getLibraryRoot()).toBe(target)
    expect(settings.get().pendingStash).toBeNull()
    expect(existsSync(join(root, 'mockups'))).toBe(false)
    expect(existsSync(join(root, 'covers'))).toBe(false)
    expect(existsSync(join(root, 'designstash.db'))).toBe(false)
    // Anything that was not the stash's own is left alone.
    expect(readFileSync(kept, 'utf8')).toBe('not ours')
  })

  it('removes the old folder when nothing else is in it', async () => {
    await service().change(join(base, 'Moved'), 'move')
    applyPendingStash(settings)
    expect(existsSync(root)).toBe(false)
  })

  it('keeps the old folder and drops the change if the new copy has gone missing', async () => {
    const target = join(base, 'Moved')
    await service().change(target, 'move')
    rmSync(join(target, 'designstash.db'))

    applyPendingStash(settings)

    expect(settings.getLibraryRoot()).toBe(root)
    expect(settings.get().pendingStash).toBeNull()
    expect(existsSync(join(root, 'mockups/a/original.psd'))).toBe(true)
  })

  it('just switches for point, and removes nothing', async () => {
    const existing = join(base, 'Other stash')
    mkdirSync(existing)
    await service().change(existing, 'point')

    applyPendingStash(settings)

    expect(settings.getLibraryRoot()).toBe(existing)
    expect(existsSync(join(root, 'designstash.db'))).toBe(true)
  })

  it('does nothing when no change is waiting', () => {
    applyPendingStash(settings)
    expect(settings.getLibraryRoot()).toBe(root)
  })
})

it('uses real file sizes for the progress totals', async () => {
  const total = tree(root).reduce((sum, f) => sum + statSync(join(root, f)).size, 0)
  const onProgress = vi.fn<(p: StashMoveProgress) => void>()
  await new StashFolderService(repo, settings, makeDeps(), onProgress).change(join(base, 'Sizes'), 'move')
  // The live database is copied by the backup, so its old placeholder is not part of the file totals.
  expect(onProgress.mock.calls[0]![0].totalBytes).toBe(total - statSync(join(root, 'designstash.db')).size)
})
