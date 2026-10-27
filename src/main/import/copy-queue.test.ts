import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { CopyProgress } from '@shared/ipc/import'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { createTestDb } from '../db/repositories/__tests__/setup'
import type { CoverResolution } from '../psd/types'
import { CopyQueue, type CopyQueueDeps } from './copy-queue'
import { copyWithHash } from './stream-copy'
import { makeZip, zipBytes } from './__tests__/zips'

let base: string
let drop: string
let root: string
let sqlite: Database.Database
let repo: Repository
let events: CopyProgress[]
let landed: number[][]
let free: number
let resolveCover: ReturnType<typeof vi.fn<CopyQueueDeps['resolveCover']>>

const psd = (rel: string, content = rel) => {
  const path = join(drop, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  return path
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'ds-copy-'))
  drop = join(base, 'drop')
  root = join(base, 'Library')
  mkdirSync(drop)
  mkdirSync(root)
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  events = []
  landed = []
  free = 10_000_000
  resolveCover = vi.fn(async (input): Promise<CoverResolution> => {
    writeFileSync(join(input.outDir, 'cover.webp'), 'cover')
    return {
      source: 'embedded',
      coverPath: join(input.outDir, 'cover.webp'),
      thumbPath: join(input.outDir, 'thumb.webp')
    }
  })
})

afterEach(async () => {
  stopped = []
  // A queue can still have a pump scheduled; let every one settle before the database closes.
  for (const q of queues.splice(0)) await q.idle()
  sqlite.close()
  rmSync(base, { recursive: true, force: true })
})

const queues: CopyQueue[] = []
/** Every haul that stopped having landed something, as the undo history is told about it. */
let stopped: number[][] = []
const queue = (over: Partial<CopyQueueDeps> = {}) => {
  const q = new CopyQueue({
    repo,
    libraryRoot: root,
    onProgress: (e) => events.push(e),
    onLanded: (ids) => landed.push(ids),
    onStopped: (ids) => stopped.push(ids),
    deps: {
      resolveCover: async (input) => {
        // The real resolver writes into outDir, so make it first like the real one does.
        mkdirSync(input.outDir, { recursive: true })
        return resolveCover(input)
      },
      freeBytes: async () => free,
      reserveBytes: 1000,
      ...over
    }
  })
  queues.push(q)
  return q
}

const last = () => events.at(-1)!

describe('landing files', () => {
  it('copies each PSD into the stash as a mockup waiting in To sort and tells the AI queue', async () => {
    const a = psd('Phones/front.psd', 'AAAA')
    const b = psd('Phones/side.psd', 'BBBBBB')
    const q = queue()

    const started = await q.start([drop])
    await q.idle()

    expect(started).toMatchObject({ state: 'running', total: 2 })
    const rows = repo.inbox.list('to_sort')
    expect(rows.map((r) => r.title).sort()).toEqual(['front', 'side'])
    expect(rows.map((r) => r.sizeBytes).sort()).toEqual([4, 6])
    const m = repo.mockups.getMockup(rows[0]!.id)!
    expect(m).toMatchObject({ stage: 'to_sort', coverSource: 'embedded' })
    expect(m.libraryPath.startsWith(join(root, 'mockups'))).toBe(true)
    expect(readFileSync(m.libraryPath, 'utf8')).toMatch(/AAAA|BBBBBB/)
    expect(m.importContext).toMatchObject({ folderTrail: ['drop', 'Phones'] })
    expect(m.importContext).not.toHaveProperty('archiveName')
    // Originals are untouched, and no record of where they were is kept.
    expect(existsSync(a) && existsSync(b)).toBe(true)
    expect(JSON.stringify(repo.mockups.getMockup(rows[0]!.id))).not.toContain(drop)
    expect(landed.flat().sort()).toEqual(rows.map((r) => r.id).sort())
    expect(last()).toMatchObject({ state: 'done', total: 2, landed: 2 })
  })

  it('lands a PSD with no preview and no sidecar with no cover, ready for the required cover step', async () => {
    psd('a.psd')
    resolveCover.mockImplementationOnce(async () => ({ source: 'none' }))
    const q = queue()
    await q.start([join(drop, 'a.psd')])
    await q.idle()
    const m = repo.mockups.getMockup(repo.inbox.list('to_sort')[0]!.id)!
    expect(m).toMatchObject({ coverSource: 'none', coverPath: '' })
  })

  it('reports progress per file and overall, never a path', async () => {
    psd('a.psd')
    psd('b.psd')
    const q = queue()
    await q.start([drop])
    await q.idle()

    const names = events.flatMap((e) => (e.file ? [e.file.name] : []))
    expect(new Set(names)).toEqual(new Set(['a.psd', 'b.psd']))
    expect(events.some((e) => e.file?.status === 'copying')).toBe(true)
    expect(events.some((e) => e.file?.status === 'done' && e.file.mockupId !== undefined)).toBe(
      true
    )
    expect(JSON.stringify(events)).not.toContain(base)
    const landedCounts = events.map((e) => e.landed)
    expect(landedCounts).toEqual([...landedCounts].sort((x, y) => x - y))
  })
})

describe('skipping', () => {
  it('counts files that are not PSDs and does not queue them', async () => {
    psd('a.psd')
    psd('notes.txt')
    psd('cover.png')
    const q = queue()

    const status = await q.start([drop])
    await q.idle()

    expect(status.total).toBe(1)
    expect((await q.status())!.skipped).toEqual({
      notPsd: 2,
      duplicate: 0,
      unreadable: 0,
      archiveUnsupported: 0,
      noPsdInArchive: 0
    })
  })

  it('skips a PSD whose content is already in the stash, including one earlier in the same haul', async () => {
    psd('one.psd', 'SAME')
    psd('two.psd', 'SAME')
    psd('three.psd', 'DIFFERENT')
    const q = queue()
    await q.start([drop])
    await q.idle()

    const status = (await q.status())!
    expect(status.landed).toBe(2)
    expect(status.skipped.duplicate).toBe(1)
    expect(status.files.find((f) => f.skipReason === 'duplicate')?.name).toBe(
      'three.psd'.replace('three', 'two')
    )

    // Dropped again in a later haul: all duplicates.
    const again = queue()
    await again.start([drop])
    await again.idle()
    expect((await again.status())!).toMatchObject({ landed: 0, skipped: { duplicate: 3 } })
    expect(repo.inbox.list('to_sort')).toHaveLength(2)
  })

  it('skips a PSD it cannot read, cleans up what it wrote, and carries on', async () => {
    psd('bad.psd')
    psd('good.psd')
    resolveCover.mockRejectedValueOnce(new Error('corrupt'))
    const q = queue()
    await q.start([drop])
    await q.idle()

    const status = (await q.status())!
    expect(status.skipped.unreadable).toBe(1)
    expect(status.landed).toBe(1)
    expect(status.files.find((f) => f.skipReason === 'unreadable')?.name).toBe('bad.psd')
    // Only the good one has a folder in the stash.
    expect(readdirSync(join(root, 'mockups'))).toHaveLength(1)
  })

  it('writes the design slot mask beside the cover, for the AI', async () => {
    psd('a.psd')
    const writeSlotMask = vi.fn(async () => 'written' as const)
    const q = queue({ writeSlotMask })
    await q.start([join(drop, 'a.psd')])
    await q.idle()
    const m = repo.mockups.getMockup(repo.inbox.list('to_sort')[0]!.id)!
    expect(writeSlotMask).toHaveBeenCalledWith(
      m.libraryPath,
      m.coverPath,
      join(m.coverPath, '..', 'slot-mask.png')
    )
  })

  it('writes no slot mask without a cover, and lands the file when writing one fails', async () => {
    psd('a.psd')
    psd('b.psd')
    resolveCover.mockImplementationOnce(async () => ({ source: 'none' }))
    const writeSlotMask = vi.fn(async () => {
      throw new Error('out of memory')
    })
    const q = queue({ writeSlotMask })
    await q.start([drop])
    await q.idle()
    expect(writeSlotMask).toHaveBeenCalledTimes(1)
    expect((await q.status())!.landed).toBe(2)
  })

  it('clears the way back to a file once it has been handled', async () => {
    psd('a.psd')
    const q = queue()
    const { haulId } = await q.start([drop])
    await q.idle()
    expect(repo.copyJobs.getJobs(haulId).every((j) => j.sourcePath === '')).toBe(true)
  })
})

describe('pausing', () => {
  it('pauses with disk-full when there is no room, keeps the file queued, and carries on after Retry', async () => {
    psd('a.psd', 'AAAA')
    psd('b.psd', 'BBBB')
    free = 10
    const q = queue()
    const { haulId } = await q.start([drop])
    await q.idle()

    expect(last()).toMatchObject({ state: 'paused', pauseReason: 'disk-full', landed: 0 })
    expect(repo.inbox.list('to_sort')).toHaveLength(0)

    free = 10_000_000
    await q.retry(haulId)
    await q.idle()

    expect(last()).toMatchObject({ state: 'done', landed: 2 })
    expect(last()).not.toHaveProperty('pauseReason')
  })

  it('pauses with disk-full when the disk fills while copying, and removes the half copy', async () => {
    psd('a.psd')
    let calls = 0
    const q = queue({
      copyHashed: async (src, dest, onBytes) => {
        if (++calls === 1) throw Object.assign(new Error('no space'), { code: 'ENOSPC' })
        return copyWithHash(src, dest, onBytes)
      }
    })
    const { haulId } = await q.start([drop])
    await q.idle()

    expect(last()).toMatchObject({ state: 'paused', pauseReason: 'disk-full' })
    expect(readdirSync(join(root, 'mockups'))).toHaveLength(0)

    await q.retry(haulId)
    await q.idle()
    expect(last()).toMatchObject({ state: 'done', landed: 1 })
  })

  it('pauses with source-gone when a file has disappeared, for example an unplugged drive', async () => {
    const a = psd('a.psd')
    psd('b.psd')
    const q = queue()
    const { haulId } = await q.start([drop])
    rmSync(a)
    await q.idle()

    expect(last()).toMatchObject({ state: 'paused', pauseReason: 'source-gone' })

    writeFileSync(a, 'back')
    await q.retry(haulId)
    await q.idle()
    expect(last()).toMatchObject({ state: 'done', landed: 2 })
  })

  it('stays paused with the same reason if Retry cannot fix it yet', async () => {
    psd('a.psd')
    free = 1
    const q = queue()
    const { haulId } = await q.start([drop])
    await q.idle()
    await q.retry(haulId)
    await q.idle()
    expect(last()).toMatchObject({ state: 'paused', pauseReason: 'disk-full' })
  })

  it('does not let a pause reason hold a path', async () => {
    psd('a.psd')
    free = 1
    const q = queue()
    await q.start([drop])
    await q.idle()
    expect(JSON.stringify(events)).not.toContain(base)
  })
})

describe('joining a running haul', () => {
  it('adds new drops to the haul that is still going', async () => {
    psd('a.psd', 'A')
    free = 1 // hold the first haul open
    const q = queue()
    const first = await q.start([join(drop, 'a.psd')])
    await q.idle()
    const b = psd('b.psd', 'B')

    const second = await q.start([b])

    expect(second.haulId).toBe(first.haulId)
    expect(second.total).toBe(2)
    free = 10_000_000
    await q.retry(first.haulId)
    await q.idle()
    expect(last()).toMatchObject({ state: 'done', landed: 2 })
  })

  it('starts a new haul once the last one is finished', async () => {
    psd('a.psd', 'A')
    const q = queue()
    const first = await q.start([drop])
    await q.idle()
    const b = psd('b.psd', 'B')
    const second = await q.start([b])
    expect(second.haulId).not.toBe(first.haulId)
    await q.idle()
    expect(last()).toMatchObject({ haulId: second.haulId, state: 'done', landed: 1 })
  })
})

describe('a drop that is still being read', () => {
  /** A stat that waits until the test lets one path through, so a drop can be held mid-read. */
  const gated = (gatedPath: string) => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const stat: CopyQueueDeps['stat'] = async (p) => {
      if (p === gatedPath) await gate
      return { size: 1 }
    }
    return { stat, release }
  }

  it('starts a new haul when the haul it would have joined finishes during the read', async () => {
    const a = psd('a.psd', 'A')
    const b = psd('b.psd', 'B')
    const { stat, release } = gated(b)
    const q = queue({ stat })
    const first = await q.start([a])

    const second = q.start([b])
    await q.idle()
    expect(last()).toMatchObject({ haulId: first.haulId, state: 'done' })
    release()
    const status = await second
    await q.idle()

    expect(status.haulId).not.toBe(first.haulId)
    expect(last()).toMatchObject({ haulId: status.haulId, state: 'done', landed: 1 })
    expect(repo.inbox.list('to_sort')).toHaveLength(2)
  })

  it('starts a new haul when the haul it would have joined is cancelled during the read', async () => {
    const a = psd('a.psd', 'A')
    const b = psd('b.psd', 'B')
    free = 1 // hold the first haul open
    const { stat, release } = gated(b)
    const q = queue({ stat })
    const first = await q.start([a])
    await q.idle()
    expect(last().state).toBe('paused')

    const second = q.start([b])
    await q.cancel(first.haulId)
    free = 10_000_000
    release()
    const status = await second
    await q.idle()

    expect(status.haulId).not.toBe(first.haulId)
    expect(last()).toMatchObject({ haulId: status.haulId, state: 'done', landed: 1 })
    expect((await q.status())!.haulId).toBe(status.haulId)
  })

  it('keeps the not-PSD counts of two drops read at the same time', async () => {
    const a = psd('a.psd', 'A')
    free = 1 // hold the first haul open
    const q = queue()
    const first = await q.start([a])
    await q.idle()
    const dropB = join(base, 'dropB')
    const dropC = join(base, 'dropC')
    mkdirSync(dropB)
    mkdirSync(dropC)
    writeFileSync(join(dropB, 'x.txt'), 'x')
    writeFileSync(join(dropB, 'b.psd'), 'B')
    writeFileSync(join(dropC, 'y.txt'), 'y')
    writeFileSync(join(dropC, 'z.txt'), 'z')
    writeFileSync(join(dropC, 'c.psd'), 'C')

    const [one, two] = await Promise.all([q.start([dropB]), q.start([dropC])])
    await q.idle()

    expect(one.haulId).toBe(first.haulId)
    expect(two.haulId).toBe(first.haulId)
    const status = (await q.status())!
    expect(status.total).toBe(3)
    expect(status.skipped.notPsd).toBe(3)
  })
})

describe('cancel and undo', () => {
  it('a haul that lands its files is one undo entry, and its figures carry the entry', async () => {
    psd('a.psd', 'A')
    psd('b.psd', 'B')
    const q = queue()

    await q.start([drop])
    await q.idle()

    const ids = repo.inbox.list('to_sort').map((r) => r.id)
    expect(stopped).toEqual([expect.arrayContaining(ids)])
    expect(last()).toMatchObject({ state: 'done', undoEntryId: 1 })
    expect(await q.status()).toMatchObject({ undoEntryId: 1 })
  })

  it('a cancelled haul is one undo entry for what had landed', async () => {
    psd('a.psd', 'A')
    psd('b.psd', 'B')
    let calls = 0
    const q: CopyQueue = queue({
      copyHashed: async (src, dest, onBytes) => {
        const res = await copyWithHash(src, dest, onBytes)
        if (++calls === 1) await q.cancel(events[0]!.haulId)
        return res
      }
    })
    await q.start([drop])
    await q.idle()

    expect(stopped).toHaveLength(1)
    expect(stopped[0]).toHaveLength(1)
  })

  it('a haul that lands nothing records nothing', async () => {
    mkdirSync(drop, { recursive: true })
    writeFileSync(join(drop, 'notes.txt'), 'n')
    const q = queue()
    await q.start([drop])
    await q.idle()
    expect(stopped).toEqual([])
  })

  it('stops and gives back what had landed, which stays until Undo all', async () => {
    psd('a.psd', 'A')
    psd('b.psd', 'B')
    psd('c.psd', 'C')
    let calls = 0
    const q: CopyQueue = queue({
      copyHashed: async (src, dest, onBytes) => {
        const res = await copyWithHash(src, dest, onBytes)
        if (++calls === 1) await q.cancel(events[0]!.haulId)
        return res
      }
    })
    const { haulId } = await q.start([drop])
    await q.idle()

    const landedIds = await q.cancel(haulId)

    expect(last().state).toBe('cancelled')
    expect(landedIds.landedIds).toHaveLength(1)
    expect(repo.inbox.list('to_sort')).toHaveLength(1)
    expect((await q.status())!.landed).toBe(1)
  })

  it('forgets the way back to files that will now never be copied', async () => {
    psd('a.psd', 'A')
    psd('b.psd', 'B')
    psd('c.psd', 'C')
    free = 1 // nothing copies, so every file is still waiting
    const q = queue()
    const { haulId } = await q.start([drop])
    await q.idle()
    expect(repo.copyJobs.getJobs(haulId).every((j) => j.sourcePath !== '')).toBe(true)

    await q.cancel(haulId)

    expect(repo.copyJobs.getJobs(haulId).map((j) => j.sourcePath)).toEqual(['', '', ''])
  })

  it('forgets the way back to waiting files when a paused haul is undone', async () => {
    psd('a.psd', 'A')
    psd('b.psd', 'B')
    free = 1
    const q = queue()
    const { haulId } = await q.start([drop])
    await q.idle()

    await q.undoAll(haulId)

    expect(repo.copyJobs.getJobs(haulId).map((j) => j.sourcePath)).toEqual(['', ''])
    expect((await q.status())!.state).toBe('undone')
  })

  it('Undo all removes the records and the app copies and never touches the originals', async () => {
    const a = psd('a.psd', 'A')
    const b = psd('b.psd', 'B')
    const q = queue()
    const { haulId } = await q.start([drop])
    await q.idle()
    const folders = readdirSync(join(root, 'mockups'))
    expect(folders).toHaveLength(2)

    const res = await q.undoAll(haulId)

    expect(res.tossedIds).toHaveLength(2)
    expect(repo.inbox.list('to_sort')).toEqual([])
    expect(
      readdirSync(join(root, 'mockups')).flatMap((d) => readdirSync(join(root, 'mockups', d)))
    ).toEqual([])
    expect(existsSync(a) && existsSync(b)).toBe(true)
    expect((await q.status())!.state).toBe('undone')
  })

  it("Undo all waits for its own haul's file in flight, not for a haul dropped after it", async () => {
    const a = psd('a.psd', 'A')
    const b = psd('b.psd', 'B')
    const open: Record<string, () => void> = {}
    const started: Record<string, Promise<void>> = {}
    const gate = (path: string) => {
      let begin!: () => void
      started[path] = new Promise<void>((r) => (begin = r))
      return { begin, wait: new Promise<void>((r) => (open[path] = r)) }
    }
    const gates = { [a]: gate(a), [b]: gate(b) }
    const q = queue({
      copyHashed: async (src, dest, onBytes) => {
        gates[src as string]!.begin()
        await gates[src as string]!.wait
        return copyWithHash(src, dest, onBytes)
      }
    })
    const first = await q.start([a])
    await started[a]

    const undone = q.undoAll(first.haulId)
    const second = await q.start([b])
    expect(second.haulId).not.toBe(first.haulId)
    open[a]!()
    await started[b]
    const outcome = await Promise.race([
      undone.then(() => 'undone'),
      new Promise((r) => setTimeout(() => r('waiting'), 200))
    ])

    expect(outcome).toBe('undone')
    expect((await undone).tossedIds).toHaveLength(1)
    open[b]!()
    await q.idle()
    expect(last()).toMatchObject({ haulId: second.haulId, state: 'done', landed: 1 })
  })

  it('Undo all leaves alone anything already looked over and stashed', async () => {
    psd('a.psd', 'A')
    psd('b.psd', 'B')
    const q = queue()
    const { haulId } = await q.start([drop])
    await q.idle()
    const [first] = repo.inbox.list('to_sort')
    repo.mockups.setStage([first!.id], 'stashed')

    const res = await q.undoAll(haulId)

    expect(res.tossedIds).toHaveLength(1)
    expect(repo.mockups.getMockup(first!.id)).toBeDefined()
  })

  it('ignores a haul id it does not know', async () => {
    const q = queue()
    expect(await q.cancel('nope')).toEqual({ landedIds: [] })
    expect(await q.undoAll('nope')).toEqual({ tossedIds: [] })
    await expect(q.retry('nope')).rejects.toThrow()
  })
})

describe('resuming at launch', () => {
  it('carries on a haul that was running when the app closed, from the file it had reached', async () => {
    psd('a.psd', 'A')
    psd('b.psd', 'B')
    psd('c.psd', 'C')
    const first = queue()
    const { haulId } = await first.start([drop])
    await first.idle()
    // Simulate a crash mid-way: c is mid-copy and nothing has landed for it.
    const jobs = repo.copyJobs.getJobs(haulId)
    const c = jobs.find((j) => j.fileName === 'c.psd')!
    repo.trash.deleteMockupsHard([c.mockupId!])
    repo.copyJobs.setJobState(c.id, { status: 'copying' })
    repo.copyJobs.updateJob(c.id, { sourcePath: join(drop, 'c.psd') })
    repo.copyJobs.setHaulState(haulId, { state: 'running' })

    const restarted = queue()
    await restarted.resume()
    await restarted.idle()

    expect(repo.inbox.list('to_sort')).toHaveLength(3)
    expect(last()).toMatchObject({ state: 'done', landed: 3 })
  })

  it('leaves a paused haul paused until Retry', async () => {
    psd('a.psd')
    free = 1
    const first = queue()
    await first.start([drop])
    await first.idle()

    events = []
    const restarted = queue()
    await restarted.resume()
    await restarted.idle()

    expect((await restarted.status())!).toMatchObject({ state: 'paused', pauseReason: 'disk-full' })
    expect(repo.inbox.list('to_sort')).toHaveLength(0)
  })

  it('does nothing when there is no haul', async () => {
    await expect(queue().resume()).resolves.toBeUndefined()
    expect(await queue().status()).toBeNull()
  })

  it('clears a copy a crash cut off, then copies the file again', async () => {
    const source = psd('a.psd', 'AAAA')
    repo.copyJobs.createHaul('crashed', [], 0)
    repo.copyJobs.addJobs('crashed', [
      { sourcePath: source, fileName: 'a.psd', folderTrail: [], sizeBytes: 4 }
    ])
    const job = repo.copyJobs.getJobs('crashed')[0]!
    repo.copyJobs.setJobState(job.id, { status: 'copying' })
    // Half of a.psd, written before the crash; and a PSD someone put in the stash by hand.
    const cutOff = join(root, 'mockups', 'cut-off')
    mkdirSync(cutOff, { recursive: true })
    writeFileSync(join(cutOff, 'original.psd.part'), 'AA')
    const theirs = join(root, 'mockups', 'theirs')
    mkdirSync(theirs, { recursive: true })
    writeFileSync(join(theirs, 'original.psd'), 'MINE')

    const restarted = queue()
    await restarted.resume()
    await restarted.idle()

    expect(existsSync(cutOff)).toBe(false)
    expect(readFileSync(join(theirs, 'original.psd'), 'utf8')).toBe('MINE')
    const m = repo.mockups.getMockup(repo.inbox.list('to_sort')[0]!.id)!
    expect(readFileSync(m.libraryPath, 'utf8')).toBe('AAAA')
  })
})

describe('a file whose mockup is in Trash', () => {
  /** Land one dropped file and give back its mockup's id. */
  const landed1 = async (rel: string, content: string) => {
    const path = psd(rel, content)
    const q = queue()
    await q.start([path])
    await q.idle()
    return repo.copyJobs.getJobs(last().haulId)[0]!.mockupId!
  }
  const dropAgain = async (rel: string) => {
    const q = queue()
    await q.start([join(drop, rel)])
    await q.idle()
    return (await q.status())!
  }
  const mockupFolders = () => readdirSync(join(root, 'mockups')).sort()

  it('brings it back with its title, description and tags, and keeps no second copy', async () => {
    const id = await landed1('a.psd', 'SAME')
    repo.mockups.updateMockup(id, { title: 'Glass iPhone', description: 'On a desk' })
    const style = repo.tags.createCategory({ label: 'Mood' })
    const calm = repo.tags.createTag({ label: 'Calm', categoryId: style.id })
    repo.mockups.addTagToMockup(id, calm.id)
    repo.trash.moveToTrash(id)
    const folders = mockupFolders()
    landed.length = 0

    const status = await dropAgain('a.psd')

    expect(repo.mockups.getMockup(id)).toMatchObject({
      deletedAt: null,
      title: 'Glass iPhone',
      description: 'On a desk'
    })
    expect(repo.mockups.getTagsForMockup(id).map((t) => t.label)).toEqual(['Calm'])
    expect(mockupFolders()).toEqual(folders)
    expect(status.files[0]).toMatchObject({ status: 'done', mockupId: id, restored: true })
    expect(status.skipped.duplicate).toBe(0)
    expect(landed).toEqual([[id]])
  })

  it('marks only the row of a file that brought its mockup back, after a restart too', async () => {
    const id = await landed1('a.psd', 'SAME')
    expect((await queue().status())!.files[0]).not.toHaveProperty('restored')
    repo.trash.moveToTrash(id)
    psd('b.psd', 'NEW')

    const q = queue()
    await q.start([join(drop, 'a.psd'), join(drop, 'b.psd')])
    await q.idle()

    const rows = (await queue().status())!.files
    expect(rows.find((f) => f.name === 'a.psd')).toMatchObject({ restored: true })
    expect(rows.find((f) => f.name === 'b.psd')).not.toHaveProperty('restored')
  })

  it('brings back the whole pile it went to Trash with', async () => {
    const top = await landed1('top.psd', 'TOP')
    const member = await landed1('member.psd', 'MEMBER')
    repo.piles.createPile([top, member], top)
    repo.trash.moveToTrash(top)

    await dropAgain('member.psd')

    expect(repo.mockups.getMockup(top)!.deletedAt).toBeNull()
    expect(repo.mockups.getMockup(member)).toMatchObject({ deletedAt: null, groupId: top })
  })

  it('takes the new copy as its PSD when its own went missing while it sat in Trash', async () => {
    const id = await landed1('a.psd', 'SAME')
    repo.trash.moveToTrash(id)
    rmSync(repo.mockups.getMockup(id)!.libraryPath)

    await dropAgain('a.psd')

    const m = repo.mockups.getMockup(id)!
    expect(m.deletedAt).toBeNull()
    expect(readFileSync(m.libraryPath, 'utf8')).toBe('SAME')
  })

  it('still skips a file whose mockup is in the library, as a duplicate', async () => {
    await landed1('a.psd', 'SAME')
    const status = await dropAgain('a.psd')
    expect(status.skipped.duplicate).toBe(1)
  })
})

describe('a copy in progress', () => {
  it('writes under a .part name, so a copy cut off is never taken for a PSD, and lands as original.psd', async () => {
    psd('a.psd', 'AAAA')
    const written: string[] = []
    const q = queue({
      copyHashed: async (src, dest, onBytes) => {
        written.push(dest)
        return copyWithHash(src, dest, onBytes)
      }
    })

    await q.start([drop])
    await q.idle()

    expect(written).toHaveLength(1)
    expect(written[0]!.endsWith(join('original.psd.part'))).toBe(true)
    const m = repo.mockups.getMockup(repo.inbox.list('to_sort')[0]!.id)!
    expect(m.libraryPath).toBe(written[0]!.slice(0, -'.part'.length))
    expect(readdirSync(join(m.libraryPath, '..'))).not.toContain('original.psd.part')
  })
})

describe('byte progress', () => {
  /** A copy that writes `steps` equal chunks, moving a fake clock `stepMs` for each. */
  const steppedCopy = (
    clock: { t: number },
    steps: number,
    stepMs: number
  ): Partial<CopyQueueDeps> => ({
    now: () => clock.t,
    copyHashed: async (src, dest, onBytes) => {
      const data = readFileSync(src as string)
      writeFileSync(dest, data)
      for (let i = 1; i <= steps; i++) {
        clock.t += stepMs
        onBytes(Math.floor((data.length * i) / steps))
      }
      return copyWithHash(src, join(dest, '..', 'hash-only.tmp'), () => {}).then((r) => {
        rmSync(join(dest, '..', 'hash-only.tmp'), { force: true })
        return r
      })
    }
  })

  const data = (n: number) => 'x'.repeat(n)

  it('moves while a file copies, not only when it finishes', async () => {
    const clock = { t: 1_000_000 }
    psd('big.psd', data(1000))
    const q = queue(steppedCopy(clock, 10, 150))

    await q.start([drop])
    await q.idle()

    const while_ = events.filter(
      (e) => e.file?.status === 'copying' && (e.file.bytesCopied ?? 0) > 0
    )
    expect(while_.length).toBeGreaterThanOrEqual(5)
    const overall = while_.map((e) => e.bytesCopied)
    expect(overall).toEqual([...overall].sort((a, b) => a - b))
    expect(new Set(overall).size).toBeGreaterThanOrEqual(5)
    for (const e of while_) {
      expect(e.bytesCopied).toBeLessThanOrEqual(e.bytesTotal)
      expect(e.file!.size).toBe(1000)
    }
    expect(last()).toMatchObject({ state: 'done', bytesTotal: 1000, bytesCopied: 1000 })
  })

  it('pushes about ten times a second however many chunks arrive', async () => {
    const clock = { t: 5_000_000 }
    psd('big.psd', data(5000))
    // 1000 chunks in one second of fake time: one every millisecond.
    const q = queue(steppedCopy(clock, 1000, 1))

    await q.start([drop])
    await q.idle()

    const copying = events.filter(
      (e) => e.file?.status === 'copying' && (e.file.bytesCopied ?? 0) > 0
    )
    expect(copying.length).toBeGreaterThanOrEqual(8)
    expect(copying.length).toBeLessThanOrEqual(12)
  })

  it('counts every file in the haul, handled ones included, so the bar reaches the end', async () => {
    psd('one.psd', data(400))
    psd('two.psd', data(400)) // a duplicate of one
    psd('three.psd', data(200))
    const q = queue()

    const started = await q.start([drop])
    await q.idle()

    expect(started.bytesTotal).toBe(1000)
    expect(last()).toMatchObject({ state: 'done', bytesTotal: 1000, bytesCopied: 1000, landed: 2 })
    const copied = events.map((e) => e.bytesCopied)
    expect(copied).toEqual([...copied].sort((a, b) => a - b))
  })

  it('gives a file its own progress: the share copied, and the whole file once it lands', async () => {
    const clock = { t: 9_000_000 }
    psd('big.psd', data(800))
    const q = queue(steppedCopy(clock, 4, 200))
    await q.start([drop])
    await q.idle()

    const row = (e: (typeof events)[number]) => e.file?.bytesCopied ?? 0
    const mid = events.filter((e) => e.file?.status === 'copying' && row(e) > 0 && row(e) < 800)
    expect(mid.length).toBeGreaterThan(0)
    expect(events.filter((e) => e.file?.status === 'done').at(-1)?.file).toMatchObject({
      bytesCopied: 800,
      size: 800
    })
  })

  it('says nothing about time left until it has measured for a moment, then counts it down at the speed it sees', async () => {
    const clock = { t: 2_000_000 }
    psd('big.psd', data(10_000))
    // 10 chunks of 1000 bytes, 400 ms apart: 2500 bytes a second.
    const q = queue(steppedCopy(clock, 10, 400))
    await q.start([drop])
    await q.idle()

    const during = events.filter(
      (e) => e.state === 'running' && e.file?.status === 'copying' && e.bytesCopied > 0
    )
    expect(during[0]!.secondsLeft).toBeNull()
    expect(during[0]!.bytesPerSecond).toBe(0)
    const measured = during.filter((e) => e.secondsLeft !== null)
    expect(measured.length).toBeGreaterThan(0)
    for (const e of measured) {
      expect(e.bytesPerSecond).toBeCloseTo(2500, -1)
      expect(e.secondsLeft).toBe(Math.ceil((e.bytesTotal - e.bytesCopied) / e.bytesPerSecond))
    }
    const seconds = measured.map((e) => e.secondsLeft!)
    expect(seconds).toEqual([...seconds].sort((a, b) => b - a))
    expect(last()).toMatchObject({ state: 'done', secondsLeft: null, bytesPerSecond: 0 })
  })

  it('has no speed or time left while paused', async () => {
    psd('a.psd', data(100))
    free = 1
    const q = queue()
    await q.start([drop])
    await q.idle()
    expect(last()).toMatchObject({ state: 'paused', bytesPerSecond: 0, secondsLeft: null })
  })

  it('reads sizes once and keeps them across a restart', async () => {
    psd('a.psd', data(300))
    free = 1
    const first = queue()
    const { haulId } = await first.start([drop])
    await first.idle()
    expect(repo.copyJobs.getJobs(haulId).map((j) => j.sizeBytes)).toEqual([300])

    free = 10_000_000
    const restarted = queue()
    await restarted.resume()
    await restarted.retry(haulId)
    await restarted.idle()
    expect(last()).toMatchObject({ state: 'done', bytesTotal: 300, bytesCopied: 300 })
  })

  it('copies a real multi-megabyte file and reports its progress in steps', async () => {
    const path = join(drop, 'real.psd')
    writeFileSync(path, Buffer.alloc(6 * 1024 * 1024, 3))
    let t = 0
    const q = queue({ now: () => (t += 100) })
    await q.start([drop])
    await q.idle()

    const partial = events.filter(
      (e) => e.file?.status === 'copying' && (e.file.bytesCopied ?? 0) > 0
    )
    expect(partial.length).toBeGreaterThanOrEqual(3)
    expect(last()).toMatchObject({ state: 'done', bytesCopied: 6 * 1024 * 1024 })
  })
})

describe('zips', () => {
  const zip = (rel: string, entries: Parameters<typeof makeZip>[1]) => {
    const path = join(drop, rel)
    mkdirSync(join(path, '..'), { recursive: true })
    return makeZip(path, entries)
  }

  it('lands each PSD inside a dropped zip and leaves the zip as it was', async () => {
    const z = await zip('Free_Cap_Mockup.zip', [
      { name: 'Free_Cap_Mockup/Files/Free_Cap_Mockup.psd', data: 'CAP-FRONT' },
      { name: 'Free_Cap_Mockup/Files/Back.psd', data: 'CAP-BACK!!', compress: false },
      { name: '__MACOSX/Free_Cap_Mockup/Files/._Back.psd', data: 'apple' },
      { name: 'Get 50% off.url', data: 'x' }
    ])
    const before = readFileSync(z)
    const q = queue()

    const started = await q.start([z])
    await q.idle()

    expect(started).toMatchObject({ total: 2, bytesTotal: 19, skipped: { notPsd: 0 } })
    expect(started.files.map((f) => [f.name, f.archiveName, f.size])).toEqual([
      ['Back.psd', 'Free_Cap_Mockup.zip', 10],
      ['Free_Cap_Mockup.psd', 'Free_Cap_Mockup.zip', 9]
    ])
    const rows = repo.inbox.list('to_sort')
    expect(rows.map((r) => r.title).sort()).toEqual(['Back', 'Free_Cap_Mockup'])
    expect(rows.map((r) => r.sizeBytes).sort()).toEqual([10, 9])
    const contents = rows.map((r) =>
      readFileSync(repo.mockups.getMockup(r.id)!.libraryPath, 'utf8')
    )
    expect(contents.sort()).toEqual(['CAP-BACK!!', 'CAP-FRONT'])
    expect(repo.mockups.getMockup(rows[0]!.id)!.importContext).toMatchObject({
      folderTrail: ['Free Cap Mockup'],
      archiveName: 'Free_Cap_Mockup.zip',
      archiveTitle: 'Free Cap Mockup'
    })
    expect(readFileSync(z).equals(before)).toBe(true)
    expect(last()).toMatchObject({ state: 'done', landed: 2, bytesCopied: 19 })
    expect(JSON.stringify(events)).not.toContain(base)
  })

  it('reads the cover from the copy in the stash, for zips and loose PSDs alike', async () => {
    const z = await zip('Cap.zip', [{ name: 'Files/Cap.psd', data: 'CAP' }])
    const loose = psd('Loose.psd', 'LOOSE')
    const q = queue()
    await q.start([z, loose])
    await q.idle()

    const inputs = resolveCover.mock.calls.map(([input]) => input)
    expect(inputs).toHaveLength(2)
    for (const input of inputs) {
      expect(input.psdPath).toBe(join(input.outDir, 'original.psd'))
      expect(existsSync(input.psdPath)).toBe(true)
    }
    expect(inputs.map((i) => i.sidecarFor).sort()).toEqual([loose, join(z, 'Files/Cap.psd')].sort())
  })

  it('offers the images in a PSD’s own zip as its preview, and reads them out of the zip', async () => {
    const z = await zip('Can.zip', [
      { name: 'Kit/Can.psd', data: 'CAN' },
      { name: 'Kit/Can.jpg', data: 'JPEG BYTES' },
      { name: 'Kit/license.pdf', data: 'pdf' },
      { name: '__MACOSX/Kit/._Can.jpg', data: 'apple' }
    ])
    const beside = join(drop, 'Folder', 'Loose.jpg')
    psd('Folder/Loose.psd', 'LOOSE')
    writeFileSync(beside, 'LOOSE JPEG')
    const q = queue()
    await q.start([z, join(drop, 'Folder')])
    await q.idle()

    const inputs = resolveCover.mock.calls.map(([input]) => input)
    const zipped = inputs.find((i) => i.sidecarFor === join(z, 'Kit/Can.psd'))!
    expect(zipped.candidateImagePaths).toEqual([beside, join(z, 'Kit/Can.jpg')])
    expect((await zipped.readImage!(join(z, 'Kit/Can.jpg'))).toString()).toBe('JPEG BYTES')
    expect((await zipped.readImage!(beside)).toString()).toBe('LOOSE JPEG')

    const loose = inputs.find((i) => i.sidecarFor === join(drop, 'Folder', 'Loose.psd'))!
    expect(loose.candidateImagePaths).toEqual([beside])
  })

  it('still lands a zipped PSD when its zip’s images cannot be listed', async () => {
    const z = await zip('Can.zip', [{ name: 'Can.psd', data: 'CAN' }])
    const q = queue({ listArchive: async () => Promise.reject(new Error('bad zip')) })
    await q.start([z])
    await q.idle()

    expect(repo.inbox.list('to_sort').map((r) => r.title)).toEqual(['Can'])
    expect(resolveCover.mock.calls[0]![0].candidateImagePaths).toEqual([])
  })

  it('lists archives that gave no PSD as skipped rows, each once', async () => {
    writeFileSync(join(drop, 'Pack.rar'), 'rar')
    await zip('Fonts.zip', [{ name: 'a.otf', data: 'x' }])
    psd('a.psd')
    const q = queue()
    const started = await q.start([drop])
    await q.idle()

    expect(started.files.filter((f) => f.status === 'skipped')).toEqual([
      expect.objectContaining({ name: 'Fonts.zip', skipReason: 'no-psd-in-archive', size: 0 }),
      expect.objectContaining({ name: 'Pack.rar', skipReason: 'archive-unsupported', size: 0 })
    ])
    expect(last()).toMatchObject({
      state: 'done',
      total: 3,
      landed: 1,
      skipped: { notPsd: 0, archiveUnsupported: 1, noPsdInArchive: 1 }
    })
  })

  it('finishes at once when a drop has only zips with no PSD inside', async () => {
    const z = await zip('Fonts.zip', [{ name: 'a.otf', data: 'x' }])
    const q = queue()
    const started = await q.start([z])
    await q.idle()
    expect(started).toMatchObject({ state: 'done', total: 1, landed: 0 })
  })

  it('checks the disk against the uncompressed size', async () => {
    const z = await zip('Big.zip', [{ name: 'Big.psd', data: 'x'.repeat(5000) }])
    // The zip itself is far smaller than 5000 bytes, but the PSD inside is not.
    free = 5000
    const q = queue()
    await q.start([z])
    await q.idle()
    expect(last()).toMatchObject({ state: 'paused', pauseReason: 'disk-full' })
  })

  it('pauses with source-gone when the zip goes away, and carries on when it is back', async () => {
    const z = await zip('Cap.zip', [{ name: 'Cap.psd', data: 'CAP' }])
    const bytes = readFileSync(z)
    const q = queue()
    const { haulId } = await q.start([z])
    rmSync(z)
    await q.idle()
    expect(last()).toMatchObject({ state: 'paused', pauseReason: 'source-gone' })

    writeFileSync(z, bytes)
    await q.retry(haulId)
    await q.idle()
    expect(last()).toMatchObject({ state: 'done', landed: 1 })
  })

  it('skips the PSD as unreadable when the zip no longer holds it', async () => {
    const z = await zip('Cap.zip', [{ name: 'Cap.psd', data: 'CAP' }])
    const q = queue()
    await q.start([z])
    await makeZip(z, [{ name: 'Other.psd', data: 'OTHER' }])
    await q.idle()
    expect(last()).toMatchObject({ state: 'done', landed: 0, skipped: { unreadable: 1 } })
    expect(readdirSync(join(root, 'mockups'))).toHaveLength(0)
  })

  it('remembers a zip whose name says nothing, without a title for it', async () => {
    const z = await zip('011.zip', [{ name: '011.psd', data: 'X' }])
    const q = queue()
    await q.start([z])
    await q.idle()
    const m = repo.mockups.getMockup(repo.inbox.list('to_sort')[0]!.id)!
    expect(m.importContext).toMatchObject({ archiveName: '011.zip' })
    expect(m.importContext).not.toHaveProperty('archiveTitle')
  })

  it('trims the spaces some zips leave around a file name from the title', async () => {
    const z = await zip('Tape.zip', [{ name: ' Hanging Duct Tape Mockup.psd', data: 'TAPE' }])
    const q = queue()
    await q.start([z])
    await q.idle()
    expect(repo.inbox.list('to_sort').map((r) => r.title)).toEqual(['Hanging Duct Tape Mockup'])
  })

  it('knows a PSD inside a zip that is already in the stash', async () => {
    psd('Cap.psd', 'SAME')
    const first = queue()
    await first.start([join(drop, 'Cap.psd')])
    await first.idle()
    const z = await zip('Cap.zip', [{ name: 'Cap.psd', data: 'SAME' }])
    const again = queue()
    await again.start([z])
    await again.idle()
    expect(last()).toMatchObject({ landed: 0, skipped: { duplicate: 1 } })
  })

  it('forgets the zip and the entry once a PSD is handled, and keeps the zip name for its row', async () => {
    const z = await zip('Cap.zip', [{ name: 'Cap.psd', data: 'CAP' }])
    const q = queue()
    const { haulId } = await q.start([z])
    await q.idle()
    expect(repo.copyJobs.getJobs(haulId)).toEqual([
      expect.objectContaining({ sourcePath: '', archiveEntry: null, archiveName: 'Cap.zip' })
    ])
    expect((await q.status())!.files[0]).toMatchObject({ archiveName: 'Cap.zip' })
  })

  it('streams the entry again from the start after a restart', async () => {
    const z = await zip('Cap.zip', [
      { name: 'A.psd', data: 'AAA' },
      { name: 'B.psd', data: 'BBB' }
    ])
    const first = queue()
    const { haulId } = await first.start([z])
    await first.idle()
    // Simulate a crash while B was copying.
    const b = repo.copyJobs.getJobs(haulId).find((j) => j.fileName === 'B.psd')!
    repo.trash.deleteMockupsHard([b.mockupId!])
    repo.copyJobs.setJobState(b.id, { status: 'copying' })
    sqlite
      .prepare('UPDATE copy_jobs SET source_path = ?, archive_entry = ? WHERE id = ?')
      .run(z, 'B.psd', b.id)
    repo.copyJobs.setHaulState(haulId, { state: 'running' })

    const restarted = queue()
    await restarted.resume()
    await restarted.idle()

    const rows = repo.inbox.list('to_sort')
    expect(rows).toHaveLength(2)
    const contents = rows.map((r) =>
      readFileSync(repo.mockups.getMockup(r.id)!.libraryPath, 'utf8')
    )
    expect(contents.sort()).toEqual(['AAA', 'BBB'])
  })

  describe('a zip inside a zip', () => {
    const nested = async () => {
      const inner = await zipBytes(join(base, 'inner-src.zip'), [
        { name: 'Cards/Notebook.psd', data: 'NOTE' }
      ])
      return zip('Free_3_Cards_Mockup.zip', [
        { name: 'Free_3_Cards_Mockup/File/Free_3_Cards_Mockup.psd.zip', data: inner }
      ])
    }

    it('lands the PSDs inside it, named after the zip that was dropped', async () => {
      const z = await nested()
      const q = queue()
      const started = await q.start([z])
      await q.idle()

      expect(started.files).toEqual([
        expect.objectContaining({ name: 'Notebook.psd', archiveName: 'Free_3_Cards_Mockup.zip' })
      ])
      const [row] = repo.inbox.list('to_sort')
      expect(readFileSync(repo.mockups.getMockup(row!.id)!.libraryPath, 'utf8')).toBe('NOTE')
      expect(repo.mockups.getMockup(row!.id)!.importContext).toMatchObject({
        folderTrail: ['Free 3 Cards Mockup', 'Cards'],
        archiveName: 'Free_3_Cards_Mockup.zip',
        archiveTitle: 'Free 3 Cards Mockup'
      })
    })

    it('stages the inner zip in the stash and clears it when the haul finishes', async () => {
      const z = await nested()
      free = 1 // hold the haul open
      const q = queue()
      const { haulId } = await q.start([z])
      await q.idle()
      expect(readdirSync(join(root, '.staging'))).toHaveLength(1)

      free = 10_000_000
      await q.retry(haulId)
      await q.idle()
      expect(last()).toMatchObject({ state: 'done', landed: 1 })
      expect(existsSync(join(root, '.staging'))).toBe(false)
    })

    it('clears staging when the haul is cancelled', async () => {
      const z = await nested()
      free = 1
      const q = queue()
      const { haulId } = await q.start([z])
      await q.idle()
      await q.cancel(haulId)
      await q.idle()
      expect(existsSync(join(root, '.staging'))).toBe(false)
    })

    it('keeps the staging a paused haul still needs across a restart, and clears orphans', async () => {
      const z = await nested()
      free = 1
      const first = queue()
      await first.start([z])
      await first.idle()
      mkdirSync(join(root, '.staging', 'orphan'), { recursive: true })
      writeFileSync(join(root, '.staging', 'orphan', '0.zip'), 'left behind')

      const restarted = queue()
      await restarted.resume()
      await restarted.idle()

      expect(readdirSync(join(root, '.staging'))).toHaveLength(1)
      expect(existsSync(join(root, '.staging', 'orphan'))).toBe(false)
    })

    it('clears all staging at launch when no haul needs it', async () => {
      mkdirSync(join(root, '.staging', 'orphan'), { recursive: true })
      await queue().resume()
      expect(existsSync(join(root, '.staging'))).toBe(false)
    })
  })
})
