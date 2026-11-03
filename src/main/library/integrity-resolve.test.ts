import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
    copyInto: async (from, to) => {
      copies.push({ from, to })
      files[to] = files[from] ?? 0
    }
  }
  return { files, removed, copies, deps }
}

const service = (deps: Partial<IntegrityDeps>) => new IntegrityService(t.repo, LIB, deps)

const goneRow = (title = 'Glass iPhone 14') =>
  t.repo.createMockup(
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
})

describe('add', () => {
  it('puts a found file in To sort in place, queued for suggestions by the caller', async () => {
    const path = `${mockups}/x1/poster_new.psd`
    const disk = fakeDisk({ [path]: 48 })
    const s = service(disk.deps)
    const [item] = (await s.report()).found

    const { mockupIds } = await s.add([item!.id])

    expect(mockupIds).toHaveLength(1)
    const created = t.repo.getMockup(mockupIds[0]!)!
    expect(created).toMatchObject({
      title: 'poster_new',
      libraryPath: path,
      stage: 'to_sort',
      reviewStatus: 'needs_review',
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
    expect(t.repo.getMockup(gone.id)).toBeDefined()
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
    expect(t.repo.getMockup(gone.id)).toBeDefined()
  })

  it('skips ignored files', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 1, [`${mockups}/x2/b.psd`]: 2 })
    const s = service(disk.deps)
    const [first] = (await s.report()).found
    await s.ignore([first!.id])
    expect((await s.addAll()).mockupIds).toHaveLength(1)
  })
})

describe('undo add', () => {
  it('removes the new records and their covers but never the PSD', async () => {
    const path = `${mockups}/x1/a.psd`
    const disk = fakeDisk({ [path]: 5 })
    const s = service(disk.deps)
    const [item] = (await s.report()).found
    const { mockupIds } = await s.add([item!.id])

    await s.undoAdd(mockupIds)

    expect(t.repo.getMockup(mockupIds[0]!)).toBeUndefined()
    expect(disk.removed).not.toContain(path)
    // The file is a found file again.
    expect((await s.report()).found).toHaveLength(1)
  })

  it('leaves records that were not added by this action', async () => {
    const disk = fakeDisk({})
    const other = t.repo.createMockup(approvedMockup({ libraryPath: `${mockups}/k/original.psd` }))
    await service(disk.deps).undoAdd([other.id])
    expect(t.repo.getMockup(other.id)).toBeDefined()
  })
})

describe('remove', () => {
  it('removes the record of a missing PSD, with its search entry and cover', async () => {
    const disk = fakeDisk({ [`${mockups}/g1/cover.webp`]: 1 })
    const gone = goneRow()
    t.repo.upsertSearchIndex(gone.id)
    const s = service(disk.deps)

    const { removed } = await s.remove([`m${gone.id}`])

    expect(removed).toBe(1)
    expect(t.repo.getMockup(gone.id)).toBeUndefined()
    expect(
      t.sqlite.prepare('SELECT rowid FROM mockups_fts WHERE rowid = ?').all(gone.id)
    ).toHaveLength(0)
    expect(disk.removed).toContain(`${mockups}/g1/cover.webp`)
  })

  it('cannot remove a found file or a record whose PSD is still there', async () => {
    const present = `${mockups}/p1/original.psd`
    const disk = fakeDisk({ [present]: 1, [`${mockups}/x1/a.psd`]: 1 })
    const kept = t.repo.createMockup(approvedMockup({ libraryPath: present }))
    const s = service(disk.deps)
    const [found] = (await s.report()).found
    const { removed } = await s.remove([found!.id, `m${kept.id}`])
    expect(removed).toBe(0)
    expect(t.repo.getMockup(kept.id)).toBeDefined()
    expect(disk.removed).toEqual([])
  })

  it('removeAll removes every missing record', async () => {
    const disk = fakeDisk({})
    goneRow('One')
    t.repo.createMockup(approvedMockup({ title: 'Two', libraryPath: `${mockups}/g2/original.psd` }))
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
    expect(t.repo.getMockup(gone.id)).toMatchObject({ libraryPath: moved, sizeBytes: 77 })
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
    const after = t.repo.getMockup(gone.id)!
    expect(after.libraryPath).toMatch(/^\/lib\/mockups\/[^/]+\/original\.psd$/)
    expect(after.libraryPath).not.toBe(gonePsd)
  })

  it('does nothing when the dialog is cancelled', async () => {
    const disk = fakeDisk({})
    disk.deps.pickFile = async () => null
    const gone = goneRow()
    expect(await service(disk.deps).relink(`m${gone.id}`)).toEqual({ outcome: 'cancelled' })
    expect(t.repo.getMockup(gone.id)!.libraryPath).toBe(gonePsd)
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
    t.repo.createMockup(approvedMockup({ libraryPath: used }))
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
    expect(t.repo.getMockup(gone.id)!.libraryPath).toBe(gonePsd)
  })

  it('only relinks a record that is really missing', async () => {
    const present = `${mockups}/p1/original.psd`
    const disk = fakeDisk({ [present]: 1 })
    disk.deps.pickFile = async () => {
      throw new Error('should not open the dialog')
    }
    const kept = t.repo.createMockup(approvedMockup({ libraryPath: present }))
    expect(await service(disk.deps).relink(`m${kept.id}`)).toEqual({ outcome: 'failed' })
  })
})

describe('ignore', () => {
  it('hides ignored files and records from the report and the scan, and unignore brings them back', async () => {
    const disk = fakeDisk({ [`${mockups}/x1/a.psd`]: 1 })
    const gone = goneRow()
    const s = service(disk.deps)
    const report = await s.report()

    const { ignoredIds } = await s.ignore([report.found[0]!.id, `m${gone.id}`])

    expect(ignoredIds).toHaveLength(2)
    expect(await s.report()).toEqual({ found: [], gone: [] })
    expect(await s.scan()).toEqual({ orphanFiles: [], orphanRecords: [] })

    await s.unignore(ignoredIds)
    expect((await s.report()).found).toHaveLength(1)
    expect((await s.report()).gone).toHaveLength(1)
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
    expect(t.repo.getMockup(mockupIds[0]!)).toMatchObject({ coverPath: '', coverSource: 'none' })
  })
})
