import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { watchCoverChanges, watchCovers, type WatchFn } from './cover-watch'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const undo of cleanup.splice(0).reverse()) undo()
})

describe('a cover deleted mid-session (F-012, design/specs/cover.md)', () => {
  it('shows as missing at the next list, without the list checking every cover on disk', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ds-covers-'))
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    mkdirSync(join(root, 'mockups', 'poster'), { recursive: true })
    const cover = join(root, 'mockups', 'poster', 'cover.webp')
    writeFileSync(cover, 'webp')
    const { sqlite, repo } = createTestDb()
    cleanup.push(() => (sqlite as Database.Database).close())
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Poster', coverPath: cover }))
    const coverMissing = () => repo.library.getLibrary({ sort: 'date' }).find((r) => r.id === m.id)?.coverMissing

    expect(coverMissing()).toBe(false)
    cleanup.push(watchCovers(root, (path) => repo.library.forgetCoversUnder(path)))
    rmSync(cover)

    await expect.poll(coverMissing, { timeout: 5_000, interval: 50 }).toBe(true)
  })
})

describe('a cover deleted mid-session in a stash folder with a space, # and %', () => {
  it('is forgotten under the path the library stored, not a URL-encoded or /private one', async () => {
    const base = mkdtempSync(join(tmpdir(), 'ds-covers-'))
    cleanup.push(() => rmSync(base, { recursive: true, force: true }))
    const root = join(base, 'Application Support #1 100%', 'Library')
    mkdirSync(join(root, 'mockups', 'poster'), { recursive: true })
    const cover = join(root, 'mockups', 'poster', 'cover.webp')
    writeFileSync(cover, 'webp')
    const forgotten: string[] = []
    cleanup.push(watchCovers(root, (path) => forgotten.push(path)))

    rmSync(cover)

    await expect.poll(() => forgotten.includes(cover), { timeout: 5_000, interval: 50 }).toBe(true)
  })
})

describe('watchCoverChanges', () => {
  /** A watch that hands its listener to the test. */
  const fakeWatch = () => {
    let listener: ((event: string, filename: string | null) => void) | undefined
    const watch: WatchFn = (_root, _opts, l) => {
      listener = l
      return { close: vi.fn(), on: vi.fn(), unref: vi.fn() } as unknown as ReturnType<WatchFn>
    }
    return { watch, fire: (filename: string) => listener!('rename', filename) }
  }

  it('tells the window once when covers the library had seen change, however many go at once', () => {
    vi.useFakeTimers()
    cleanup.push(() => vi.useRealTimers())
    const fake = fakeWatch()
    const changed = vi.fn()
    const forget = vi.fn((path: string) => path.endsWith('cover.webp'))
    cleanup.push(watchCoverChanges('/stash', { forget, changed }, fake.watch))

    fake.fire(join('mockups', 'a', 'cover.webp'))
    fake.fire(join('mockups', 'b', 'cover.webp'))
    expect(changed).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)

    expect(forget).toHaveBeenCalledWith(join('/stash', 'mockups', 'a', 'cover.webp'))
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('says nothing when the change is to a file no cover in the list is, such as the database', () => {
    vi.useFakeTimers()
    cleanup.push(() => vi.useRealTimers())
    const fake = fakeWatch()
    const changed = vi.fn()
    cleanup.push(watchCoverChanges('/stash', { forget: () => false, changed }, fake.watch))

    fake.fire('designstash.db-wal')
    vi.advanceTimersByTime(100)

    expect(changed).not.toHaveBeenCalled()
  })
})

describe('watchCovers', () => {
  /** A watch that hands its listener to the test. */
  const fakeWatch = () => {
    let listener: ((event: string, filename: string | null) => void) | undefined
    const close = vi.fn()
    const watch: WatchFn = (_root, _opts, l) => {
      listener = l
      return { close, on: vi.fn(), unref: vi.fn() } as unknown as ReturnType<WatchFn>
    }
    return { watch, close, fire: (event: string, filename: string | null) => listener!(event, filename) }
  }

  it('says which path under the stash folder changed', () => {
    const fake = fakeWatch()
    const changed = vi.fn()
    watchCovers('/stash', changed, fake.watch)

    fake.fire('rename', join('mockups', 'a', 'cover.webp'))

    expect(changed).toHaveBeenCalledWith(join('/stash', 'mockups', 'a', 'cover.webp'))
  })

  it('names the whole folder when the event can’t say what changed', () => {
    const fake = fakeWatch()
    const changed = vi.fn()
    watchCovers('/stash', changed, fake.watch)

    fake.fire('rename', null)

    expect(changed).toHaveBeenCalledWith('/stash')
  })

  it('stops when told', () => {
    const fake = fakeWatch()
    const stop = watchCovers('/stash', vi.fn(), fake.watch)
    stop()
    expect(fake.close).toHaveBeenCalled()
  })

  it('does nothing when the folder can’t be watched, so covers are checked once a launch as before', () => {
    const changed = vi.fn()
    const stop = watchCovers('/stash', changed, () => {
      throw new Error('ENOENT')
    })
    expect(() => stop()).not.toThrow()
    expect(changed).not.toHaveBeenCalled()
  })
})
