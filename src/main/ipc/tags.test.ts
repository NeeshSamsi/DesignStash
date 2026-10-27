import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { IpcResult } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'
import type { Repository } from '../db/repository'
import { seedTaxonomy } from '../db/bootstrap'
import { TagService } from '../db/tag-service'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { undoForTests } from '../undo/test-support'
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
  registerTagHandlers({ repo, ...undoForTests(repo, test.db) } as unknown as HandlerContext)
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

  it('records a tag a person makes as made by a person', async () => {
    const device = category('Device').id
    await call(IPC_CHANNELS.TAG_CREATE, { label: 'Foldable', categoryId: device })
    expect(repo.tags.getTagByLabel(device, 'Foldable')?.createdBy).toBe('user')
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

describe('a name the AI only suggested so far (F-034)', () => {
  const suggest = async (category: string, label: string) =>
    (await new TagService(repo).snapTags([{ category, label }]))[0]!
  const listed = () =>
    repo.tags
      .getTagTree()
      .flatMap((c) => [c.categoryLabel, ...c.tags.map((t) => `${c.categoryLabel}/${t.label}`)])

  it('a person adding it makes it theirs, so it is listed and never pruned', async () => {
    const id = await suggest('Device', 'Foldable')
    const res = await call(IPC_CHANNELS.TAG_CREATE, {
      label: 'foldable',
      categoryId: category('Device').id
    })

    expect(res).toMatchObject({ success: true, data: { tagId: id, label: 'Foldable' } })
    expect(repo.tags.getAllTags().find((t) => t.id === id)?.createdBy).toBe('user')
    expect(listed()).toContain('Device/Foldable')
  })

  it('a person adding a category the AI only suggested makes it theirs', async () => {
    await suggest('Colour', 'Beige')
    const res = await call(IPC_CHANNELS.CATEGORY_CREATE, { label: 'colour' })

    expect(res).toMatchObject({ success: true, data: { label: 'Colour' } })
    expect(listed()).toContain('Colour')
    expect(listed()).not.toContain('Colour/Beige')
  })

  it('a tag a person adds in it makes the category theirs too', async () => {
    await suggest('Colour', 'Beige')
    const colour = repo.tags.getCategoryByLabel('Colour')!
    await call(IPC_CHANNELS.TAG_CREATE, { label: 'Terracotta', categoryId: colour.id })

    expect(listed()).toEqual(expect.arrayContaining(['Colour', 'Colour/Terracotta']))
  })

  it('the lists leave suggestions out', async () => {
    await suggest('Colour', 'Beige')
    const tree = await call<{ tree: { categoryLabel: string }[] }>(IPC_CHANNELS.TAG_TREE)
    const byCategory = await call<{ categories: { categoryLabel: string }[] }>(
      IPC_CHANNELS.TAG_LIST_BY_CATEGORY
    )

    expect(tree.success && tree.data.tree.map((c) => c.categoryLabel)).not.toContain('Colour')
    expect(
      byCategory.success && byCategory.data.categories.map((c) => c.categoryLabel)
    ).not.toContain('Colour')
  })
})

describe('tag:rename', () => {
  it('renames the tag and search finds it by the new name', async () => {
    const phone = tag('Device', 'Phone')
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Hero shot' }))
    repo.mockups.addTagToMockup(m.id, phone.id)
    repo.search.upsertSearchIndex(m.id)

    const res = await call(IPC_CHANNELS.TAG_RENAME, { tagId: phone.id, label: 'Handset' })

    expect(res).toEqual({ success: true, data: { ok: true, undoEntryId: expect.any(Number) } })
    expect(repo.library.getLibrary({ query: 'handset', sort: 'date' }).map((r) => r.id)).toEqual([
      m.id
    ])
  })

  it('may change only the casing of its own name', async () => {
    const phone = tag('Device', 'Phone')
    const res = await call(IPC_CHANNELS.TAG_RENAME, { tagId: phone.id, label: 'PHONE' })
    expect(res).toEqual({ success: true, data: { ok: true, undoEntryId: expect.any(Number) } })
    expect(repo.tags.getAllTags().find((t) => t.id === phone.id)?.label).toBe('PHONE')
  })

  it('refuses a name another tag in the category has, saying which, and changes nothing', async () => {
    const phone = tag('Device', 'Phone')
    const res = await call(IPC_CHANNELS.TAG_RENAME, { tagId: phone.id, label: 'iphone' })
    expect(res).toEqual({
      success: true,
      data: { ok: false, reason: 'taken', label: 'iPhone', categoryLabel: 'Device' }
    })
    expect(repo.tags.getAllTags().find((t) => t.id === phone.id)?.label).toBe('Phone')
  })

  it('allows a name a tag in another category has', async () => {
    const box = tag('Print & Branding', 'Box')
    const res = await call(IPC_CHANNELS.TAG_RENAME, { tagId: box.id, label: 'Mug' })
    expect(res).toEqual({ success: true, data: { ok: true, undoEntryId: expect.any(Number) } })
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
    expect(res).toEqual({
      success: true,
      data: { ok: false, reason: 'taken', label: 'side', categoryLabel: 'Environment' }
    })
    expect(repo.tags.getAllTags().find((t) => t.id === side.id)?.categoryId).toBe(
      category('Angle').id
    )
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
    expect(res).toEqual({
      success: true,
      data: { categoryId: category('Device').id, label: 'Device' }
    })
    expect(categoryCount()).toBe(before)
  })
})

describe('names of only spaces, and ids that are gone', () => {
  it('refuses a tag or category of only spaces at the door, and adds nothing', async () => {
    const device = category('Device').id
    const counts = [tagCount(), categoryCount()]

    const created = await call(IPC_CHANNELS.TAG_CREATE, { label: '   ', categoryId: device })
    const createdCategory = await call(IPC_CHANNELS.CATEGORY_CREATE, { label: ' ' })

    expect(created).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } })
    expect(createdCategory).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } })
    expect([tagCount(), categoryCount()]).toEqual(counts)
  })

  it('refuses a rename to only spaces', async () => {
    const phone = tag('Device', 'Phone')
    const style = category('Style').id

    const renamedTag = await call(IPC_CHANNELS.TAG_RENAME, { tagId: phone.id, label: ' ' })
    const renamedCategory = await call(IPC_CHANNELS.CATEGORY_RENAME, {
      categoryId: style,
      label: '  '
    })

    expect(renamedTag).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } })
    expect(renamedCategory).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } })
    expect(repo.tags.getAllTags().find((t) => t.id === phone.id)?.label).toBe('Phone')
    expect(repo.tags.getAllCategories().find((c) => c.id === style)?.label).toBe('Style')
  })

  it('keeps a name without the spaces around it', async () => {
    const device = category('Device').id
    const res = await call(IPC_CHANNELS.TAG_CREATE, { label: '  Foldable ', categoryId: device })
    expect(res).toMatchObject({ success: true, data: { label: 'Foldable' } })
    const cat = await call(IPC_CHANNELS.CATEGORY_CREATE, { label: ' Mood  ' })
    expect(cat).toMatchObject({ success: true, data: { label: 'Mood' } })
  })

  it('a rename or move of a tag or category that is gone answers not found', async () => {
    const rename = await call(IPC_CHANNELS.TAG_RENAME, { tagId: 9999, label: 'Handset' })
    const move = await call(IPC_CHANNELS.TAG_SET_CATEGORY, {
      tagId: 9999,
      categoryId: category('Device').id
    })
    const renameCategory = await call(IPC_CHANNELS.CATEGORY_RENAME, {
      categoryId: 9999,
      label: 'Look'
    })

    expect(!rename.success && rename.error.message).toBe('Tag 9999 not found')
    expect(!move.success && move.error.message).toBe('Tag 9999 not found')
    expect(!renameCategory.success && renameCategory.error.message).toBe('Category 9999 not found')
  })
})

describe('category:rename', () => {
  it('renames the category', async () => {
    const res = await call(IPC_CHANNELS.CATEGORY_RENAME, {
      categoryId: category('Style').id,
      label: 'Look'
    })
    expect(res).toEqual({ success: true, data: { ok: true, undoEntryId: expect.any(Number) } })
    expect(repo.tags.getCategoryByLabel('Look')).toBeDefined()
  })

  it('refuses a name another category has, whatever its casing, and changes nothing', async () => {
    const style = category('Style').id
    const res = await call(IPC_CHANNELS.CATEGORY_RENAME, { categoryId: style, label: 'angle' })
    expect(res).toEqual({ success: true, data: { ok: false, reason: 'taken', label: 'Angle' } })
    expect(repo.tags.getAllCategories().find((c) => c.id === style)?.label).toBe('Style')
  })
})

describe('tag:delete and category:delete', () => {
  it('a tag delete replies with how many mockups carried it and its undo entry, and nothing else', async () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    expect(await call(IPC_CHANNELS.TAG_DELETE, { tagId: laptop.id })).toEqual({
      success: true,
      data: { affectedMockups: 0, undoEntryId: expect.any(Number) }
    })
  })

  it('a category delete replies with the tags it moved and its undo entry, and nothing else', async () => {
    const res = await call(IPC_CHANNELS.CATEGORY_DELETE, {
      categoryId: category('Angle').id,
      moveTagsTo: category('Environment').id
    })
    expect(res).toEqual({
      success: true,
      data: { deleted: true, movedTags: expect.any(Number), undoEntryId: expect.any(Number) }
    })
  })
})
