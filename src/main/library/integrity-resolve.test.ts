import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoverResolution } from '../psd/types'
import { ensureSearchIndex } from '../db/search-index'
import { createTestDb, approvedMockup, type TestDb } from '../db/repositories/__tests__/setup'
import { IntegrityService, type IntegrityDeps } from './integrity-service'

const LIB = '/lib'
const mockups = `${LIB}/mockups`

let t: TestDb
beforeEach(() => {
  t = createTestDb()
  ensureSearchIndex(t.db)
})
afterEach(() => t.sqlite.close())

/** A fake disk: the files that exist and their sizes. */
function fakeDisk(files: Record<string, number>) {
  const removed: string[] = []
  const copies: { from: string; to: string }[] = []
  const deps: Partial<IntegrityDeps> = {
    listFiles: async () => Object.keys(files),
    exists: async (p) => p in files,
    stat: async (p) => {
      if (!(p in files)) throw new Error('ENOENT')
      return { size: files[p]! }
    },
    resolveCover: async ({ outDir }) => ({
      source: 'embedded',
      coverPath: `${outDir}/cover.webp`,
      thumbPath: `${outDir}/thumb.webp`
    }),
    rm: async (p) => {
      removed.push(p)
    },
    readdir: async (dir) =>
      Object.keys(files)
        .filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
        .map((p) => p.slice(dir.length + 1)),
    rmdir: async () => {},
    copyInto: async (from, to) => {
      copies.push({ from, to })
      files[to] = files[from] ?? 0
    }
  }
  return { files, removed, copies, deps }
}

const service = (deps: Partial<IntegrityDeps>) => new IntegrityService(t.repo, LIB, deps)

const goneRow = (title = 'Glass iPhone 14') =>
  t.repo.mockups.createMockup(
    approvedMockup({
      title,
      libraryPath: `${mockups}/g1/original.psd`,
      coverPath: `${mockups}/g1/cover.webp`
    })
  )

describe('report', () => {
  it('lists what turned up and what went missing by name, size and cover, with opaque ids', async () => {
    const disk = fakeDisk({
      [`${mockups}/x1/poster_new.psd`]: 48_000_000,
      [`${mockups}/g1/cover.webp`]: 10
    })
    const gone = goneRow()

    const report = await service(disk.deps).report()

    expect(report.found).toHaveLength(1)
    expect(report.found[0]).toMatchObject({ name: 'poster_new', sizeBytes: 48_000_000 })
    expect(report.found[0]!.coverPath).toMatch(/^\/lib\/cache\//)
    expect(report.gone).toHaveLength(1)
    expect(report.gone[0]).toMatchObject({
      name: 'Glass iPhone 14',
      coverPath: `${mockups}/g1/cover.webp`
    })
    expect(report.gone[0]!.id).toBe(`m${gone.id}`)
  })

  it('never sends the PSD path or the stash folder to the renderer', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/poster_new.psd`]: 5 })
    goneRow()
    const json = JSON.stringify(await service(disk.deps).report())
    expect(json).not.toContain('poster_new.psd')
    expect(json).not.toContain('x1')
    expect(json).not.toContain('original.psd')
  })

  it('gives a missing cover no path rather than a dead one', async () => {
    const disk = fakeDisk({})
    goneRow()
    const report = await service(disk.deps).report()
    expect(report.gone[0]!.coverPath).toBeUndefined()
  })

  it('still lists a found file whose cover cannot be read', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 5 })
    disk.deps.resolveCover = async () => {
      throw new Error('bad psd')
    }
    const report = await service(disk.deps).report()
    expect(report.found).toHaveLength(1)
    expect(report.found[0]!.coverPath).toBeUndefined()
  })

  it('gives the same id for the same file every time', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 5 })
    const first = (await service(disk.deps).report()).found[0]!.id
    const second = (await service(disk.deps).report()).found[0]!.id
    expect(first).toBe(second)
    expect(first).toMatch(/^f[0-9a-f]{16}$/)
  })

  it('gives a found file the same id after the stash folder moves, so an ignored one stays ignored', async () => {
    const before = fakeDisk({ [`${mockups}/x1/a.psd`]: 5 })
    const after = fakeDisk({ ['/Volumes/Drive/Stash/mockups/x1/a.psd']: 5 })
    const there = (await service(before.deps).report()).found[0]!.id
    const moved = new IntegrityService(t.repo, '/Volumes/Drive/Stash', after.deps)
    expect((await moved.report()).found[0]!.id).toBe(there)
  })

  it('keeps a file ignored under the id an earlier version gave it', async () => {
    const path = `${mockups}/x1/a.psd`
    const earlierId = `f${createHash('sha256').update(path).digest('hex').slice(0, 16)}`
    let saved = [earlierId]
    const store = { get: () => saved, set: (ids: string[]) => void (saved = ids) }
    const disk = fakeDisk({ [path]: 5 })

    expect(
      (await new IntegrityService(t.repo, LIB, { ...disk.deps, ignored: store }).report()).found
    ).toEqual([])
    // Stored under its new id, it stays ignored once the stash folder moves too.
    expect(saved).toHaveLength(1)
    expect(saved[0]).not.toBe(earlierId)
    const after = fakeDisk({ ['/Volumes/Drive/Stash/mockups/x1/a.psd']: 5 })
    const moved = new IntegrityService(t.repo, '/Volumes/Drive/Stash', {
      ...after.deps,
      ignored: store
    })
    expect((await moved.report()).found).toEqual([])
  })
})

describe('found files’ covers', () => {
  const stray = `${mockups}/x1/a.psd`

  it('draws a cover once, and uses it again while the file is still found, after a restart too', async () => {
    const disk = fakeDisk({ [stray]: 5 })
    const draw = vi.fn(disk.deps.resolveCover!)
    disk.deps.resolveCover = async (input) => {
      const cover = await draw(input)
      if (cover.source !== 'none') disk.files[cover.coverPath] = 1
      return cover
    }
    const s = service(disk.deps)

    const first = (await s.report()).found[0]!
    const again = (await s.report()).found[0]!
    const restarted = (await service(disk.deps).report()).found[0]!

    expect(draw).toHaveBeenCalledTimes(1)
    expect(again.coverPath).toBe(first.coverPath)
    expect(restarted.coverPath).toBe(first.coverPath)
  })

  it('clears covers drawn for files that are no longer found', async () => {
    const disk = fakeDisk({ [stray]: 5 })
    const removed: string[] = []
    const s = service({ ...disk.deps, removeFolder: async (dir) => void removed.push(dir) })
    const { id } = (await s.report()).found[0]!
    const cache = `${LIB}/cache`
    const listing = disk.deps.readdir!
    disk.deps.readdir = async (dir) => (dir === cache ? ['fold0000000000000', id] : listing(dir))

    await service({ ...disk.deps, removeFolder: async (dir) => void removed.push(dir) }).report()

    expect(removed).toEqual([`${cache}/fold0000000000000`])
  })

  it('answers in good time however many covers are still being drawn, and has them the next time', async () => {
    const disk = fakeDisk({ [stray]: 5 })
    let finish: (cover: CoverResolution) => void = () => {}
    disk.deps.resolveCover = () => new Promise((resolve) => (finish = resolve))
    const s = service({ ...disk.deps, coverWaitMs: 20 })

    const first = (await s.report()).found[0]!
    finish({
      source: 'embedded',
      coverPath: `${LIB}/cache/x/cover.webp`,
      thumbPath: `${LIB}/cache/x/thumb.webp`
    })
    const next = (await s.report()).found[0]!

    expect(first.coverPath).toBeUndefined()
    expect(next.coverPath).toBe(`${LIB}/cache/x/cover.webp`)
  })

  it('draws two covers at a time, since each reads a whole PSD', async () => {
    const disk = fakeDisk(
      Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`${mockups}/x${n}/a.psd`, 5]))
    )
    let now = 0
    let most = 0
    disk.deps.resolveCover = async ({ outDir }) => {
      most = Math.max(most, ++now)
      await new Promise((r) => setTimeout(r, 5))
      now--
      return {
        source: 'embedded',
        coverPath: `${outDir}/cover.webp`,
        thumbPath: `${outDir}/thumb.webp`
      }
    }

    const report = await service({ ...disk.deps, coverWaitMs: 5_000 }).report()

    expect(report.found.every((f) => f.coverPath)).toBe(true)
    expect(most).toBe(2)
  })
})

describe('add', () => {
  it('puts a found file in To sort in place, queued for suggestions by the caller', async () => {
    const path = `${mockups}/x1/poster_new.psd`
    const disk = fakeDisk({ [path]: 48 })
    const s = service(disk.deps)
    const [item] = (await s.report()).found

    const { mockupIds } = await s.add([item!.id])

    expect(mockupIds).toHaveLength(1)
    const created = t.repo.mockups.getMockup(mockupIds[0]!)!
    expect(created).toMatchObject({
      title: 'poster_new',
      libraryPath: path,
      stage: 'to_sort',
      sizeBytes: 48
    })
    expect(disk.copies).toEqual([])
    expect((await s.report()).found).toEqual([])
  })

  it('adds only what is still a found file: unknown ids and missing-record ids are skipped', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 5 })
    const gone = goneRow()
    const s = service(disk.deps)
    const { mockupIds } = await s.add(['fffffffffffffffff', `m${gone.id}`])
    expect(mockupIds).toEqual([])
    expect(t.repo.mockups.getMockup(gone.id)).toBeDefined()
  })

  it('does not add the same file twice', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 5 })
    const s = service(disk.deps)
    const [item] = (await s.report()).found
    await s.add([item!.id])
    const again = await s.add([item!.id])
    expect(again.mockupIds).toEqual([])
  })

  it('addAll adds every found file and leaves the missing records alone', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 1, [`${mockups}/x2/b.psd`]: 2 })
    const gone = goneRow()
    const { mockupIds } = await service(disk.deps).addAll()
    expect(mockupIds).toHaveLength(2)
    expect(t.repo.mockups.getMockup(gone.id)).toBeDefined()
  })

  it('skips ignored files', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 1, [`${mockups}/x2/b.psd`]: 2 })
    const s = service(disk.deps)
    const [first] = (await s.report()).found
    await s.ignore([first!.id])
    expect((await s.addAll()).mockupIds).toHaveLength(1)
  })
})

describe('remove', () => {
  it('removes the record of a missing PSD, with its search entry and cover', async () => {
    const disk = fakeDisk({ [`${mockups}/g1/cover.webp`]: 1 })
    const gone = goneRow()
    t.repo.search.upsertSearchIndex(gone.id)
    const s = service(disk.deps)

    const { removed, mockupIds } = await s.remove([`m${gone.id}`])

    expect(removed).toBe(1)
    expect(mockupIds).toEqual([gone.id])
    expect(t.repo.mockups.getMockup(gone.id)).toBeUndefined()
    expect(
      t.sqlite.prepare('SELECT rowid FROM mockups_fts WHERE rowid = ?').all(gone.id)
    ).toHaveLength(0)
    expect(disk.removed).toContain(`${mockups}/g1/cover.webp`)
  })

  it('cannot remove a found file or a record whose PSD is still there', async () => {
    const present = `${mockups}/p1/original.psd`
    const disk = fakeDisk({ [present]: 1, [`${mockups}/x1/a.psd`]: 1 })
    const kept = t.repo.mockups.createMockup(approvedMockup({ libraryPath: present }))
    const s = service(disk.deps)
    const [found] = (await s.report()).found
    const { removed, mockupIds } = await s.remove([found!.id, `m${kept.id}`])
    expect(removed).toBe(0)
    expect(mockupIds).toEqual([])
    expect(t.repo.mockups.getMockup(kept.id)).toBeDefined()
    expect(disk.removed).toEqual([])
  })

  it('removeAll removes every missing record', async () => {
    const disk = fakeDisk({})
    goneRow('One')
    t.repo.mockups.createMockup(
      approvedMockup({ title: 'Two', libraryPath: `${mockups}/g2/original.psd` })
    )
    expect((await service(disk.deps).removeAll()).removed).toBe(2)
  })
})

describe('relink', () => {
  const gonePsd = `${mockups}/g1/original.psd`

  it('points a missing record at a PSD inside the stash folder', async () => {
    const moved = `${mockups}/elsewhere/moved.psd`
    const disk = fakeDisk({ [moved]: 77 })
    disk.deps.pickFile = async () => moved
    const gone = goneRow()

    const result = await service(disk.deps).relink(`m${gone.id}`)

    expect(result).toEqual({ outcome: 'relinked' })
    expect(t.repo.mockups.getMockup(gone.id)).toMatchObject({ libraryPath: moved, sizeBytes: 77 })
    expect(disk.copies).toEqual([])
  })

  it('copies a PSD from outside the stash folder in, so the stash keeps holding its own copies', async () => {
    const outside = '/Users/someone/Desktop/new.psd'
    const disk = fakeDisk({ [outside]: 12 })
    disk.deps.pickFile = async () => outside
    const gone = goneRow()

    const result = await service(disk.deps).relink(`m${gone.id}`)

    expect(result).toEqual({ outcome: 'relinked' })
    expect(disk.copies).toHaveLength(1)
    expect(disk.copies[0]!.from).toBe(outside)
    const after = t.repo.mockups.getMockup(gone.id)!
    expect(after.libraryPath).toMatch(/^\/lib\/mockups\/[^/]+\/original\.psd$/)
    expect(after.libraryPath).not.toBe(gonePsd)
  })

  it('does nothing when the dialog is cancelled', async () => {
    const disk = fakeDisk({})
    disk.deps.pickFile = async () => null
    const gone = goneRow()
    expect(await service(disk.deps).relink(`m${gone.id}`)).toEqual({ outcome: 'cancelled' })
    expect(t.repo.mockups.getMockup(gone.id)!.libraryPath).toBe(gonePsd)
  })

  it('refuses a file that is not a PSD', async () => {
    const disk = fakeDisk({ '/x/a.png': 1 })
    disk.deps.pickFile = async () => '/x/a.png'
    const gone = goneRow()
    expect(await service(disk.deps).relink(`m${gone.id}`)).toEqual({ outcome: 'not-psd' })
  })

  it('refuses a PSD another mockup already uses', async () => {
    const used = `${mockups}/u/original.psd`
    const disk = fakeDisk({ [used]: 1 })
    disk.deps.pickFile = async () => used
    t.repo.mockups.createMockup(approvedMockup({ libraryPath: used }))
    const gone = goneRow()
    expect(await service(disk.deps).relink(`m${gone.id}`)).toEqual({ outcome: 'already-in-stash' })
  })

  it('reports failed when the copy fails, with the record untouched', async () => {
    const outside = '/x/new.psd'
    const disk = fakeDisk({ [outside]: 1 })
    disk.deps.pickFile = async () => outside
    disk.deps.copyInto = async () => {
      throw new Error('disk full /x')
    }
    const gone = goneRow()
    expect(await service(disk.deps).relink(`m${gone.id}`)).toEqual({ outcome: 'failed' })
    expect(t.repo.mockups.getMockup(gone.id)!.libraryPath).toBe(gonePsd)
  })

  it('only relinks a record that is really missing', async () => {
    const present = `${mockups}/p1/original.psd`
    const disk = fakeDisk({ [present]: 1 })
    disk.deps.pickFile = async () => {
      throw new Error('should not open the dialog')
    }
    const kept = t.repo.mockups.createMockup(approvedMockup({ libraryPath: present }))
    expect(await service(disk.deps).relink(`m${kept.id}`)).toEqual({ outcome: 'failed' })
  })
})

describe('ignore', () => {
  it('hides ignored files and records from the report and the scan', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 1 })
    const gone = goneRow()
    const s = service(disk.deps)
    const report = await s.report()

    const { ignoredIds } = await s.ignore([report.found[0]!.id, `m${gone.id}`])

    expect(ignoredIds).toHaveLength(2)
    expect(await s.report()).toEqual({ found: [], gone: [] })
    expect(await s.scan()).toEqual({ orphanFiles: 0, orphanRecords: 0 })
  })

  it('ignoreAll covers both groups and returns only what it newly ignored, for Undo', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 1, [`${mockups}/x2/b.psd`]: 1 })
    goneRow()
    const s = service(disk.deps)
    const [first] = (await s.report()).found
    await s.ignore([first!.id])

    const { ignoredIds } = await s.ignoreAll()

    expect(ignoredIds).toHaveLength(2)
    expect(ignoredIds).not.toContain(first!.id)
    expect(await s.report()).toEqual({ found: [], gone: [] })
  })

  it('lets the scan and the report agree on what is left once some ids are ignored', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 1, [`${mockups}/x2/b.psd`]: 1 })
    const keep = goneRow('Kept')
    const dropped = t.repo.mockups.createMockup(
      approvedMockup({ title: 'Dropped', libraryPath: `${mockups}/g2/original.psd`, coverPath: '' })
    )
    const s = service(disk.deps)
    const { found } = await s.report()
    expect(await s.scan()).toEqual({ orphanFiles: 2, orphanRecords: 2 })

    await s.ignore([found[0]!.id, `m${dropped.id}`])

    const report = await s.report()
    expect(await s.scan()).toEqual({
      orphanFiles: report.found.length,
      orphanRecords: report.gone.length
    })
    expect(report.found.map((f) => f.id)).toEqual([found[1]!.id])
    expect(report.gone.map((g) => g.id)).toEqual([`m${keep.id}`])
  })

  it('does not look for an ignored record on disk when it only needs what is visible', async () => {
    const disk = fakeDisk({})
    const ignoredRow = goneRow()
    const looked: string[] = []
    const s = service({
      ...disk.deps,
      exists: async (p) => {
        looked.push(p)
        return false
      }
    })
    await s.ignore([`m${ignoredRow.id}`])
    looked.length = 0

    expect(await s.scan()).toEqual({ orphanFiles: 0, orphanRecords: 0 })
    expect(looked).toEqual([])
  })

  it('keeps the ignore list in the store it is given, so it survives a restart', async () => {
    let saved: string[] = []
    const store = { get: () => saved, set: (ids: string[]) => void (saved = ids) }
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 1 })
    const first = new IntegrityService(t.repo, LIB, { ...disk.deps, ignored: store })
    const [item] = (await first.report()).found
    await first.ignore([item!.id])

    expect(saved).toEqual([item!.id])
    const restarted = new IntegrityService(t.repo, LIB, { ...disk.deps, ignored: store })
    expect((await restarted.report()).found).toEqual([])
  })

  it('ignoring a file that is not found is ignored', async () => {
    const disk = fakeDisk({})
    const s = service(disk.deps)
    expect((await s.ignore(['f0000000000000000'])).ignoredIds).toEqual([])
  })
})

describe('add with an unreadable PSD', () => {
  it('still adds it, without a cover', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/odd.psd`]: 5 })
    disk.deps.resolveCover = async () => {
      throw new Error('bad psd')
    }
    const s = service(disk.deps)
    const [item] = (await s.report()).found
    const { mockupIds } = await s.add([item!.id])
    expect(t.repo.mockups.getMockup(mockupIds[0]!)).toMatchObject({
      coverPath: '',
      coverSource: 'none'
    })
  })
})
