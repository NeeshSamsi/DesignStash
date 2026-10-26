import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../db/schema'
import { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { defaultAppFileOps, removeAppCopies } from './app-files'

let sqlite: Database.Database
let repo: Repository
let root: string

beforeEach(() => {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  ensureSearchIndex(db)
  repo = new Repository(db)
  root = mkdtempSync(join(tmpdir(), 'designstash-app-files-'))
})

afterEach(() => {
  sqlite.close()
  rmSync(root, { recursive: true, force: true })
})

/** Writes files (paths relative to the stash folder) and returns their full paths. */
function files(...rel: string[]): string[] {
  return rel.map((r) => {
    const path = join(root, r)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, 'x')
    return path
  })
}

const at = (rel: string) => join(root, rel)

/** A mockup record, deleted for good the way the services do it, then its files removed. */
async function deleteForGood(ids: number[], opts: { keepPsd?: boolean } = {}): Promise<void> {
  const removed = repo.trash.deleteMockupsHard(ids)
  await removeAppCopies(repo, root, removed, defaultAppFileOps, opts)
}

function mockup(libraryRel: string, coverRel: string, deleted = false): number {
  const m = repo.mockups.createMockup({
    title: 'M',
    libraryPath: at(libraryRel),
    coverPath: coverRel ? at(coverRel) : '',
    coverSource: coverRel ? 'embedded' : 'none',
    stage: 'stashed'
  })
  if (deleted) repo.mockups.updateMockup(m.id, { deletedAt: '2026-10-24 00:00:00' })
  return m.id
}

const APP_FOLDER = [
  'original.psd',
  'cover.webp',
  'thumb.webp',
  'slot-mask.png',
  'slot-mask.none',
  'cover-ai-soft.png',
  'cover-ai-grey.png'
]

describe('removeAppCopies: deleting a mockup for good', () => {
  it('removes an imported mockup’s whole folder: the PSD, cover, thumbnail, mask and masked covers', async () => {
    files(...APP_FOLDER.map((f) => `mockups/u1/${f}`))
    const id = mockup('mockups/u1/original.psd', 'mockups/u1/cover.webp')

    await deleteForGood([id])

    expect(existsSync(at('mockups/u1'))).toBe(false)
    expect(existsSync(at('mockups'))).toBe(true)
  })

  it('removes every cover folder it had, the current one and the replaced ones kept for Undo', async () => {
    files(...APP_FOLDER.map((f) => `mockups/u1/${f}`))
    const id = mockup('mockups/u1/original.psd', 'mockups/u1/cover.webp')
    const other = mockup('mockups/u2/original.psd', '')
    files(`covers/${id}-old/cover.webp`, `covers/${id}-old/thumb.webp`)
    files(
      `covers/${id}-now/cover.png`,
      `covers/${id}-now/thumb.webp`,
      `covers/${id}-now/slot-mask.png`,
      `covers/${id}-now/cover-ai-soft.png`
    )
    repo.mockups.updateMockup(id, { coverPath: at(`covers/${id}-now/cover.png`) })
    // Another mockup's cover folder, whose id starts with the same digit.
    files(`covers/${other}${id}-x/cover.webp`, `covers/${other}-x/cover.webp`)

    await deleteForGood([id])

    expect(existsSync(at('mockups/u1'))).toBe(false)
    expect(existsSync(at(`covers/${id}-old`))).toBe(false)
    expect(existsSync(at(`covers/${id}-now`))).toBe(false)
    expect(existsSync(at(`covers/${other}${id}-x/cover.webp`))).toBe(true)
    expect(existsSync(at(`covers/${other}-x/cover.webp`))).toBe(true)
  })

  it('leaves a file someone put in the mockup’s folder, and the folder with it', async () => {
    files(...APP_FOLDER.map((f) => `mockups/u1/${f}`), 'mockups/u1/notes.txt')
    const id = mockup('mockups/u1/original.psd', 'mockups/u1/cover.webp')

    await deleteForGood([id])

    expect(existsSync(at('mockups/u1/notes.txt'))).toBe(true)
    for (const f of APP_FOLDER) expect(existsSync(at(`mockups/u1/${f}`)), f).toBe(false)
  })

  it('leaves a folder another mockup still uses, even in Trash, taking only its own PSD and cover', async () => {
    files(...APP_FOLDER.map((f) => `mockups/u1/${f}`), 'mockups/u1/Mine.psd')
    const id = mockup('mockups/u1/original.psd', 'mockups/u1/cover.webp')
    mockup('mockups/u1/Mine.psd', '', true)

    await deleteForGood([id])

    expect(existsSync(at('mockups/u1/original.psd'))).toBe(false)
    expect(existsSync(at('mockups/u1/cover.webp'))).toBe(false)
    expect(existsSync(at('mockups/u1/Mine.psd'))).toBe(true)
    expect(existsSync(at('mockups/u1/slot-mask.png'))).toBe(true)
  })

  it('in a folder of someone’s own, removes the PSD and what the app wrote beside its cover, nothing else', async () => {
    files(
      'mockups/Client work/Mine.psd',
      'mockups/Client work/cover.webp',
      'mockups/Client work/thumb.webp',
      'mockups/Client work/slot-mask.png',
      'mockups/Client work/cover-ai-soft.png',
      'mockups/Client work/cover.jpg',
      'mockups/Client work/notes.txt'
    )
    const id = mockup('mockups/Client work/Mine.psd', 'mockups/Client work/cover.webp')

    await deleteForGood([id])

    for (const f of ['Mine.psd', 'cover.webp', 'thumb.webp', 'slot-mask.png', 'cover-ai-soft.png'])
      expect(existsSync(at(`mockups/Client work/${f}`)), f).toBe(false)
    expect(existsSync(at('mockups/Client work/cover.jpg'))).toBe(true)
    expect(existsSync(at('mockups/Client work/notes.txt'))).toBe(true)
  })

  it('keeps the PSD when asked, wherever it is, and still clears the app’s files', async () => {
    files(...APP_FOLDER.map((f) => `mockups/u1/${f}`))
    const id = mockup('mockups/u1/original.psd', 'mockups/u1/cover.webp')

    await deleteForGood([id], { keepPsd: true })

    expect(existsSync(at('mockups/u1/original.psd'))).toBe(true)
    for (const f of APP_FOLDER.slice(1)) expect(existsSync(at(`mockups/u1/${f}`)), f).toBe(false)
  })

  it('never touches anything outside the stash folder', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'designstash-outside-'))
    try {
      for (const f of ['original.psd', 'cover.webp', 'thumb.webp', 'slot-mask.png'])
        writeFileSync(join(outside, f), 'x')
      const m = repo.mockups.createMockup({
        title: 'Out',
        libraryPath: join(outside, 'original.psd'),
        coverPath: join(outside, 'cover.webp'),
        coverSource: 'embedded',
        stage: 'stashed'
      })

      await deleteForGood([m.id])

      for (const f of ['original.psd', 'cover.webp', 'thumb.webp', 'slot-mask.png'])
        expect(existsSync(join(outside, f)), f).toBe(true)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('is fine when the files are already gone', async () => {
    const id = mockup('mockups/u1/original.psd', 'mockups/u1/cover.webp')
    await expect(deleteForGood([id])).resolves.toBeUndefined()
  })
})
