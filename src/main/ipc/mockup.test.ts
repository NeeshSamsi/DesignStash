import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import sharp from 'sharp'
import type Database from 'better-sqlite3'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'
import type { CoverChange } from '@shared/library'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { LibraryService } from '../library/library-service'
import { PileTitles } from '../library/pile-titles'
import type { HandlerContext } from './context'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))

import { registerMockupHandlers } from './mockup'

let sqlite: Database.Database
let repo: Repository
let dir: string
let openPath: ReturnType<typeof vi.fn<(p: string) => Promise<string>>>

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

beforeEach(() => {
  handlers.clear()
  dir = mkdtempSync(join(tmpdir(), 'ds-mockup-'))
  openPath = vi.fn<(p: string) => Promise<string>>().mockResolvedValue('')
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  registerMockupHandlers({
    repo,
    settings: { getLibraryRoot: () => join(dir, 'library') },
    library: new LibraryService(repo, join(dir, 'library'), { openPath })
  } as unknown as HandlerContext)
})

afterEach(() => {
  sqlite.close()
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const png = async (name: string, width: number, height: number) => {
  const path = join(dir, name)
  await sharp({ create: { width, height, channels: 3, background: '#c97b4a' } })
    .png()
    .toFile(path)
  return path
}

describe('cover channels', () => {
  it('replaces a cover with a real image and reports its size', async () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Phone', libraryPath: join(dir, 'a.psd') }))
    const file = await png('new.png', 900, 1600)

    const res = await call<CoverChange>(IPC_CHANNELS.MOCKUP_SET_COVER, {
      mockupId: m.id,
      filePath: file
    })

    expect(res.success && res.data).toMatchObject({
      ok: true,
      coverSource: 'user-uploaded',
      width: 900,
      height: 1600,
      previous: { coverPath: '/c.png', coverSource: 'embedded' }
    })
    const stored = repo.mockups.getMockup(m.id)!
    expect(stored.coverSource).toBe('user-uploaded')
    expect(existsSync(stored.coverPath)).toBe(true)
    expect(stored.coverPath.startsWith(join(dir, 'library', 'covers'))).toBe(true)
    expect(existsSync(file)).toBe(true)
  })

  it('turns away a text file renamed to .png and keeps the cover', async () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Phone', libraryPath: join(dir, 'a.psd') }))
    const fake = join(dir, 'fake.png')
    writeFileSync(fake, 'this is not an image')

    const res = await call(IPC_CHANNELS.MOCKUP_SET_COVER, { mockupId: m.id, filePath: fake })

    expect(res).toEqual({ success: true, data: { ok: false, reason: 'not-image' } })
    expect(repo.mockups.getMockup(m.id)?.coverPath).toBe('/c.png')
  })

  it('reports a file that is not there as unreadable', async () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Phone', libraryPath: join(dir, 'a.psd') }))
    const res = await call(IPC_CHANNELS.MOCKUP_SET_COVER, {
      mockupId: m.id,
      filePath: join(dir, 'nope.png')
    })
    expect(res).toEqual({ success: true, data: { ok: false, reason: 'unreadable' } })
  })

  it('reports an unreadable PSD when going back to the embedded preview', async () => {
    const m = repo.mockups.createMockup(
      approvedMockup({
        title: 'Phone',
        libraryPath: join(dir, 'missing.psd'),
        coverSource: 'user-uploaded'
      })
    )
    const res = await call(IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER, { mockupId: m.id })
    expect(res).toEqual({ success: true, data: { ok: false, reason: 'unreadable' } })
    expect(repo.mockups.getMockup(m.id)?.coverSource).toBe('user-uploaded')
  })
})

describe('MOCKUP_OPEN_EXTERNAL', () => {
  it('opens the top mockup of a pile', async () => {
    const top = repo.mockups.createMockup(
      approvedMockup({ title: 'Top', libraryPath: join(dir, 'top.psd'), isGroup: true })
    )
    writeFileSync(join(dir, 'top.psd'), 'psd')

    const res = await call(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, { mockupId: top.id })

    expect(res).toEqual({ success: true, data: { opened: true } })
    expect(openPath).toHaveBeenCalledWith(join(dir, 'top.psd'))
  })

  it('gives a reason and nothing else when it cannot open', async () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'M', libraryPath: join(dir, 'm.psd') }))
    writeFileSync(join(dir, 'm.psd'), 'psd')
    openPath.mockResolvedValueOnce('Failed to open path /Users/someone/m.psd')

    const res = await call(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, { mockupId: m.id })

    expect(res).toEqual({ success: true, data: { opened: false, reason: 'no-app' } })
  })
})

describe('MOCKUP_UPDATE', () => {
  const save = (mockupId: number, title: string) =>
    call(IPC_CHANNELS.MOCKUP_UPDATE, { mockupId, title, description: '', tagIds: [] })

  const pileOfTwo = () => {
    const top = repo.mockups.createMockup(
      approvedMockup({ title: 'Clay tote', libraryPath: join(dir, 'a.psd'), isGroup: true, variation: 'front' })
    )
    const side = repo.mockups.createMockup(
      approvedMockup({ title: 'Clay tote', libraryPath: join(dir, 'b.psd'), groupId: top.id, variation: 'side' })
    )
    return [top, side] as const
  }

  it('refuses a pile title of only spaces before the pile is renamed', async () => {
    const [top, side] = pileOfTwo()
    const renameBase = vi.spyOn(PileTitles.prototype, 'renameBase')

    const res = await save(side.id, '   ')

    expect(res).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } })
    expect(renameBase).not.toHaveBeenCalled()
    expect([top, side].map((m) => repo.mockups.getMockup(m.id)?.title)).toEqual(['Clay tote', 'Clay tote'])
  })

  it('refuses a title of only spaces on a mockup on its own', async () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Mug', libraryPath: join(dir, 'mug.psd') }))
    expect(await save(m.id, ' ')).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } })
    expect(repo.mockups.getMockup(m.id)?.title).toBe('Mug')
  })

  it('takes the title without the spaces around it', async () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Mug', libraryPath: join(dir, 'mug.psd') }))
    const renameBase = vi.spyOn(PileTitles.prototype, 'renameBase')
    const [, side] = pileOfTwo()

    expect(await save(m.id, '  Clay mug ')).toMatchObject({ success: true })
    expect(await save(side.id, ' Canvas tote  ')).toMatchObject({ success: true })

    expect(repo.mockups.getMockup(m.id)?.title).toBe('Clay mug')
    expect(renameBase).toHaveBeenCalledWith(side.groupId, 'Canvas tote')
  })
})
