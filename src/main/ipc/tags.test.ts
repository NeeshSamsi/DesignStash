import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { IpcResult } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'
import type { Repository } from '../db/repository'
import { seedTaxonomy } from '../db/bootstrap'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
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

import { registerTagHandlers } from './tags'

let sqlite: Database.Database
let repo: Repository

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

const category = (label: string) => repo.tags.getCategoryByLabel(label)!
const tag = (categoryLabel: string, label: string) =>
  repo.tags.getTagByLabel(category(categoryLabel).id, label)!
const tagCount = () => repo.tags.getAllTags().length
const categoryCount = () => repo.tags.getAllCategories().length

beforeEach(() => {
  handlers.clear()
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  seedTaxonomy(test.db)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  registerTagHandlers({ repo } as unknown as HandlerContext)
})

afterEach(() => {
  sqlite.close()
  vi.restoreAllMocks()
})

describe('tag:create', () => {
  it('makes a new tag in the category', async () => {
    const device = category('Device').id
    const res = await call(IPC_CHANNELS.TAG_CREATE, { label: 'Foldable', categoryId: device })
    expect(res).toMatchObject({ success: true, data: { label: 'Foldable', categoryId: device } })
    expect(repo.tags.getTagByLabel(device, 'Foldable')).toBeDefined()
  })

  it('a name the category already has, whatever its casing, answers with that tag and adds none', async () => {
    const device = category('Device').id
    const before = tagCount()
    const res = await call(IPC_CHANNELS.TAG_CREATE, { label: 'iphone', categoryId: device })
    expect(res).toEqual({
      success: true,
      data: { tagId: tag('Device', 'iPhone').id, label: 'iPhone', categoryId: device }
    })
    expect(tagCount()).toBe(before)
  })

  it('creating the same new name twice makes one tag', async () => {
    const device = category('Device').id
    const first = await call(IPC_CHANNELS.TAG_CREATE, { label: 'Clay', categoryId: device })
    const second = await call(IPC_CHANNELS.TAG_CREATE, { label: 'Clay', categoryId: device })
    expect(first).toMatchObject({ success: true })
    expect(second).toEqual(first)
    expect(repo.tags.getAllTags().filter((t) => t.label === 'Clay')).toHaveLength(1)
  })
})

describe('tag:rename', () => {
  it('renames the tag and search finds it by the new name', async () => {
    const phone = tag('Device', 'Phone')
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Hero shot' }))
    repo.mockups.addTagToMockup(m.id, phone.id)
    repo.search.upsertSearchIndex(m.id)

    const res = await call(IPC_CHANNELS.TAG_RENAME, { tagId: phone.id, label: 'Handset' })

    expect(res).toEqual({ success: true, data: { ok: true } })
    expect(repo.library.getLibrary({ query: 'handset', sort: 'date' }).map((r) => r.id)).toEqual([m.id])
  })

  it('may change only the casing of its own name', async () => {
    const phone = tag('Device', 'Phone')
    const res = await call(IPC_CHANNELS.TAG_RENAME, { tagId: phone.id, label: 'PHONE' })
    expect(res).toEqual({ success: true, data: { ok: true } })
    expect(repo.tags.getAllTags().find((t) => t.id === phone.id)?.label).toBe('PHONE')
  })

  it('refuses a name another tag in the category has, in plain words, and changes nothing', async () => {
    const phone = tag('Device', 'Phone')
    const res = await call(IPC_CHANNELS.TAG_RENAME, { tagId: phone.id, label: 'iphone' })
    expect(res.success).toBe(false)
    expect(!res.success && res.error.message).toBe('“iPhone” is already a tag in Device')
    expect(repo.tags.getAllTags().find((t) => t.id === phone.id)?.label).toBe('Phone')
  })

  it('allows a name a tag in another category has', async () => {
    const box = tag('Print & Branding', 'Box')
    const res = await call(IPC_CHANNELS.TAG_RENAME, { tagId: box.id, label: 'Mug' })
    expect(res).toEqual({ success: true, data: { ok: true } })
  })
})

describe('tag:set-category', () => {
  it('moves the tag', async () => {
    const mug = tag('Apparel', 'Mug')
    const res = await call(IPC_CHANNELS.TAG_SET_CATEGORY, {
      tagId: mug.id,
      categoryId: category('Print & Branding').id
    })
    expect(res).toEqual({ success: true, data: { ok: true } })
    expect(repo.tags.getTagByLabel(category('Print & Branding').id, 'Mug')?.id).toBe(mug.id)
  })

  it('refuses a move into a category that already has a tag by that name', async () => {
    const side = tag('Angle', 'Side')
    const clash = repo.tags.createTag({ label: 'side', categoryId: category('Environment').id })
    const res = await call(IPC_CHANNELS.TAG_SET_CATEGORY, {
      tagId: side.id,
      categoryId: clash.categoryId
    })
    expect(!res.success && res.error.message).toBe('“side” is already a tag in Environment')
    expect(repo.tags.getAllTags().find((t) => t.id === side.id)?.categoryId).toBe(category('Angle').id)
  })
})

describe('category:create', () => {
  it('makes a new category', async () => {
    const res = await call(IPC_CHANNELS.CATEGORY_CREATE, { label: 'Mood' })
    expect(res).toMatchObject({ success: true, data: { label: 'Mood' } })
    expect(repo.tags.getCategoryByLabel('Mood')).toBeDefined()
  })

  it('a name a category already has, whatever its casing, answers with that category and adds none', async () => {
    const before = categoryCount()
    const res = await call(IPC_CHANNELS.CATEGORY_CREATE, { label: 'device' })
    expect(res).toEqual({ success: true, data: { categoryId: category('Device').id, label: 'Device' } })
    expect(categoryCount()).toBe(before)
  })
})

describe('category:rename', () => {
  it('renames the category', async () => {
    const res = await call(IPC_CHANNELS.CATEGORY_RENAME, { categoryId: category('Style').id, label: 'Look' })
    expect(res).toEqual({ success: true, data: { ok: true } })
    expect(repo.tags.getCategoryByLabel('Look')).toBeDefined()
  })

  it('refuses a name another category has, whatever its casing, and changes nothing', async () => {
    const style = category('Style').id
    const res = await call(IPC_CHANNELS.CATEGORY_RENAME, { categoryId: style, label: 'angle' })
    expect(!res.success && res.error.message).toBe('There’s already a category called “Angle”')
    expect(repo.tags.getAllCategories().find((c) => c.id === style)?.label).toBe('Style')
  })
})
