import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { TO_SORT_BOARD } from '@shared/grouping'
import type * as schema from '../../db/schema'
import type { Repository } from '../../db/repository'
import { seedTaxonomy } from '../../db/bootstrap'
import { ensureSearchIndex } from '../../db/search-index'
import { approvedMockup, createTestDb } from '../../db/repositories/__tests__/setup'
import { PileService } from '../../library/pile-service'
import { PileTitles } from '../../library/pile-titles'
import { UndoHistory, type UndoRecord } from '../undo-history'
import { createDataOps, skipWords, type DataOp, type DataOps } from './index'

// design/specs/undo.md: every action does, undoes and redoes, and after redo the rows are byte for
// byte as the first do left them. Undo puts them back as they were before it.

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository
let ops: DataOps

beforeEach(() => {
  ;({ sqlite, db, repo } = createTestDb())
  seedTaxonomy(db)
  ensureSearchIndex(db)
  ops = createDataOps({ repo, db })
})

afterEach(() => sqlite.close())

/** Every row undo can touch, as text: mockups, tag links, drafts, resume points, the Sort board, tags, categories and search. */
const dump = (): string =>
  JSON.stringify(
    [
      'SELECT * FROM mockups ORDER BY id',
      'SELECT * FROM mockup_tags ORDER BY mockup_id, tag_id',
      'SELECT * FROM drafts ORDER BY mockup_id',
      'SELECT * FROM look_over_resume ORDER BY unit_id',
      'SELECT * FROM sort_boards ORDER BY batch_id',
      'SELECT * FROM tags ORDER BY id',
      'SELECT * FROM tag_categories ORDER BY id',
      'SELECT rowid, title, description, tags, keywords FROM mockups_fts ORDER BY rowid'
    ].map((q) => sqlite.prepare(q).all())
  )

const run = (op: DataOp) => ops.runner.run(op)

/**
 * Does `action` through `track`, then undo and redo: undo leaves the rows as before, redo as the
 * first do left them, byte for byte.
 */
async function roundTrip(label: string, scope: Parameters<DataOps['track']>[1], action: () => unknown) {
  const before = dump()
  const { record } = await ops.track(label, scope, action)
  expect(record).not.toBeNull()
  const afterDo = dump()
  expect(afterDo).not.toBe(before)

  expect(await run(record!.undo)).toEqual({ ok: true })
  expect(dump()).toBe(before)
  expect(await run(record!.redo)).toEqual({ ok: true })
  expect(dump()).toBe(afterDo)
  return record!
}

let n = 0
const stashed = (title: string, extra: Parameters<typeof approvedMockup>[0] = {}) => {
  const m = repo.mockups.createMockup(approvedMockup({ title, libraryPath: `/lib/u${n++}.psd`, ...extra }))
  repo.search.upsertSearchIndex(m.id)
  return m.id
}
const waiting = (title: string, stage: 'to_sort' | 'to_stash') =>
  repo.mockups.createMockup(approvedMockup({ title, libraryPath: `/lib/w${n++}.psd`, stage })).id
const tagId = (label: string) => repo.tags.getAllTags().find((t) => t.label === label)!.id
const pileOf = (titles: string[]) => {
  const ids = titles.map((t) => stashed(t))
  new PileService(repo).create(ids, ids[0]!)
  return ids
}

describe('Move to Trash, and Restore', () => {
  it('a mockup on its own', async () => {
    const id = stashed('Mug')
    await roundTrip('Move to Trash', { mockupIds: [id] }, () => repo.trash.moveManyToTrash([id]))
  })

  it('several at once, a pile among them', async () => {
    const [top] = pileOf(['Tote front', 'Tote side'])
    const single = stashed('Cup')
    await roundTrip('Move to Trash', { mockupIds: [...ops.scopes.pile(top!), single] }, () =>
      repo.trash.moveManyToTrash([top!, single])
    )
  })

  it('a mockup from inside a pile, which leaves the pile and takes its full title (F-013)', async () => {
    const [top, side] = pileOf(['Tote front', 'Tote side'])
    await roundTrip('Move to Trash', { mockupIds: ops.scopes.pile(top!) }, () => repo.trash.moveManyToTrash([side!]))
  })

  it('Restore from Trash', async () => {
    const id = stashed('Mug')
    repo.trash.moveManyToTrash([id])
    await roundTrip('Restore', { mockupIds: [id] }, () => repo.trash.restoreMany([id]))
  })

  it('Toss, which is Move to Trash from an inbox, and Restore puts it back in that inbox', async () => {
    const sorting = waiting('Fresh', 'to_sort')
    const record = await roundTrip('Toss', { mockupIds: [sorting] }, () => repo.trash.moveManyToTrash([sorting]))
    expect(repo.mockups.getMockup(sorting)).toMatchObject({ stage: 'to_sort', trashOrigin: 'to-sort' })
    expect(record.label).toBe('Toss')
  })
})

describe('pile changes', () => {
  const piles = () => new PileService(repo)

  it('New pile', async () => {
    const ids = ['A', 'B', 'C'].map((t) => stashed(t))
    await roundTrip('New pile', { mockupIds: ids }, () => piles().create(ids, ids[1]!))
  })

  it('Merge into a pile', async () => {
    const target = pileOf(['T1', 'T2'])
    const source = pileOf(['S1', 'S2'])
    await roundTrip('Merge piles', { mockupIds: [...target, ...source] }, () => piles().merge([source[0]!], target[0]!))
  })

  it('Disband pile', async () => {
    const ids = pileOf(['D1', 'D2', 'D3'])
    await roundTrip('Disband pile', { mockupIds: ids }, () => piles().disband(ids[0]!))
  })

  it('Remove from pile, the top included', async () => {
    const ids = pileOf(['R1', 'R2', 'R3'])
    await roundTrip('Remove from pile', { mockupIds: ids }, () => piles().removeFromPile(ids[0]!, ids[0]!))
  })

  it('Put on top, the star moving with it', async () => {
    const ids = pileOf(['P1', 'P2'])
    repo.mockups.setFavourite(ids[0]!, true)
    await roundTrip('Put on top', { mockupIds: ids }, () => piles().setTop(ids[0]!, ids[1]!))
  })

  it('Rename pile and Set variation', async () => {
    const ids = pileOf(['Clay tote front', 'Clay tote side'])
    const titles = new PileTitles(repo)
    await roundTrip('Rename pile', { mockupIds: ids }, () => titles.renameBase(ids[0]!, 'Canvas tote'))
    await roundTrip('Set variation', { mockupIds: ids }, () => titles.setVariation(ids[1]!, 'hanging'))
  })
})

describe('details, star and cover', () => {
  it('Edit details: title, description and tags', async () => {
    const id = stashed('Old', { description: 'Plain' })
    repo.mockups.addTagToMockup(id, tagId('Phone'))
    repo.search.upsertSearchIndex(id)
    await roundTrip('Edit details', { mockupIds: [id] }, () =>
      repo.mockups.updateMockupMeta(id, { title: 'New', description: 'On a desk', tagIds: [tagId('Laptop')] })
    )
  })

  it('undoes only the fields the action changed, so a description the AI wrote since stays', async () => {
    const id = stashed('Old', { description: 'Plain' })
    const { record } = await ops.track('Edit details', { mockupIds: [id] }, () =>
      repo.mockups.updateMockupMeta(id, { title: 'New', description: 'Plain', tagIds: [] })
    )
    repo.mockups.updateMockup(id, { description: 'Written by the AI since' })

    await run(record!.undo)

    expect(repo.mockups.getMockup(id)).toMatchObject({ title: 'Old', description: 'Written by the AI since' })
  })

  it('Star and unstar', async () => {
    const id = stashed('Mug')
    await roundTrip('Star', { mockupIds: [id] }, () => repo.mockups.setFavourite(id, true))
    await roundTrip('Remove star', { mockupIds: [id] }, () => repo.mockups.setFavourite(id, false))
  })

  it('Replace cover and Use the PSD’s preview', async () => {
    const id = stashed('Mug', { coverPath: '/lib/mug/cover.webp' })
    await roundTrip('Replace cover', { mockupIds: [id] }, () =>
      repo.mockups.setMockupCover(id, '/lib/covers/1-abc/mine.png', 'user-uploaded')
    )
    await roundTrip('Use the PSD’s preview', { mockupIds: [id] }, () =>
      repo.mockups.setMockupCover(id, '/lib/mug/cover.webp', 'embedded')
    )
  })
})

describe('Sort and Look it over', () => {
  it('Undo Sort puts back the stage, the piles and the rest of the saved board', async () => {
    const ids = ['s1', 's2', 's3', 's4'].map((t) => waiting(t, 'to_sort'))
    repo.sortBoards.save({
      batchId: TO_SORT_BOARD,
      groups: [{ id: 'g1', memberIds: [ids[0]!, ids[1]!] }, { id: 'g2', memberIds: [ids[2]!, ids[3]!] }],
      singletonIds: []
    })
    // "Sort 2": only the first pile commits; the second stays on the board.
    const committed = [ids[0]!, ids[1]!]
    await roundTrip('Sort', { mockupIds: committed, sortBoard: true }, () =>
      repo.transaction(() => {
        repo.piles.confirmGroupings([{ id: 'g1', memberIds: committed }], [])
        repo.sortBoards.remove(committed)
        repo.mockups.setStage(committed, 'to_stash')
      })
    )
  })

  it('Stash & next puts the mockup back in To stash with its draft', async () => {
    const id = waiting('Clay phone', 'to_stash')
    repo.drafts.ensureDraft(id, { title: 'Clay phone', description: 'On a stand', tagIds: [tagId('Phone')] })
    repo.drafts.setResume(id, id)
    await roundTrip('Stash', { mockupIds: [id] }, () => {
      repo.drafts.stash(id, [id])
      repo.search.upsertSearchIndex(id)
    })
  })
})

describe('tags and categories (Settings › Tags)', () => {
  it('Delete a tag, and it comes back on every mockup', async () => {
    const tag = tagId('Phone')
    const [a, b] = [stashed('A'), stashed('B')]
    for (const id of [a, b]) {
      repo.mockups.addTagToMockup(id, tag)
      repo.search.upsertSearchIndex(id)
    }
    await roundTrip('Delete tag', { tagIds: [tag], mockupIds: ops.scopes.taggedWith([tag]) }, () => repo.tags.deleteTag(tag))
  })

  it('Rename a tag, and search follows', async () => {
    const tag = tagId('Phone')
    const a = stashed('A')
    repo.mockups.addTagToMockup(a, tag)
    repo.search.upsertSearchIndex(a)
    await roundTrip('Rename tag', { tagIds: [tag] }, () => repo.tags.renameTag(tag, 'Handset'))
  })

  it('Merge tags', async () => {
    const [source, target] = [tagId('MacBook'), tagId('Laptop')]
    const a = stashed('A')
    repo.mockups.addTagToMockup(a, source)
    repo.search.upsertSearchIndex(a)
    await roundTrip('Merge tags', { tagIds: [source, target], mockupIds: ops.scopes.taggedWith([source, target]) }, () =>
      repo.tags.mergeTags(source, target)
    )
  })

  it('Delete a category, its tags moving into another, a same-named one merging', async () => {
    const angle = repo.tags.getCategoryByLabel('Angle')!.id
    const environment = repo.tags.getCategoryByLabel('Environment')!.id
    repo.tags.createTag({ label: 'Side', categoryId: environment, createdBy: 'user' })
    const a = stashed('A')
    repo.mockups.addTagToMockup(a, repo.tags.getTagByLabel(angle, 'Side')!.id)
    repo.search.upsertSearchIndex(a)
    const tagIds = [...ops.scopes.tagsIn(angle), ...ops.scopes.tagsIn(environment)]
    await roundTrip(
      'Delete category',
      { categoryIds: [angle, environment], tagIds, mockupIds: ops.scopes.taggedWith(tagIds) },
      () => repo.tags.deleteCategory(angle, environment)
    )
  })

  it('Rename a category, and move a tag to another', async () => {
    const style = repo.tags.getCategoryByLabel('Style')!.id
    await roundTrip('Rename category', { categoryIds: [style] }, () => repo.tags.renameCategory(style, 'Look'))
    const mug = tagId('Mug')
    await roundTrip('Move tag', { tagIds: [mug] }, () => repo.tags.reassignTagCategory(mug, style))
  })
})

describe('rows an action makes', () => {
  it('Add from the stash check: undo takes the record away, redo puts it back', async () => {
    const before = dump()
    const { record } = await ops.track(
      'Add to My Stash',
      {},
      () => {
        const id = stashed('Found poster')
        repo.mockups.addTagToMockup(id, tagId('Poster'))
        repo.search.upsertSearchIndex(id)
        return id
      },
      (id) => ({ mockupIds: [id] })
    )
    const afterDo = dump()
    await run(record!.undo)
    expect(dump()).toBe(before)
    await run(record!.redo)
    expect(dump()).toBe(afterDo)
  })
})

describe('Undo import (settled point 1)', () => {
  it('moves what the haul brought in to Trash, marked as from an undone import, and redo brings it back', async () => {
    const ids = ['h1', 'h2', 'h3'].map((t) => waiting(t, 'to_sort'))
    const afterImport = dump()
    const record = ops.importRecord('Import of 3 mockups', ids)

    expect(await run(record.undo)).toEqual({ ok: true })
    expect(repo.trash.getTrashEntries().map((e) => [e.row.id, e.origin]).sort()).toEqual(
      ids.map((id) => [id, 'import']).sort()
    )
    expect(repo.inbox.list('to_sort')).toEqual([])

    expect(await run(record.redo)).toEqual({ ok: true })
    expect(dump()).toBe(afterImport)
  })
})

describe('a target that is gone', () => {
  it('a mockup deleted for good since: the step is skipped, nothing changes, with the words for the toast', async () => {
    const [a, b] = [stashed('A'), stashed('B')]
    const { record } = await ops.track('Edit details', { mockupIds: [a, b] }, () => {
      repo.mockups.updateMockup(a, { title: 'A2' })
      repo.mockups.updateMockup(b, { title: 'B2' })
    })
    repo.trash.deleteMockupsHard([b])
    const before = dump()

    expect(await run(record!.undo)).toEqual({ ok: false, missing: { kind: 'mockup', id: b } })
    expect(dump()).toBe(before)
    expect(skipWords('undo', 'Edit details', { kind: 'mockup', id: b })).toBe(
      'Couldn’t undo Edit details: that mockup was deleted for good'
    )
  })

  it('a tag deleted for good since, for a redo that would put it back on a mockup', async () => {
    const a = stashed('A')
    const tag = repo.tags.createTag({ label: 'Clay', categoryId: repo.tags.getCategoryByLabel('Style')!.id, createdBy: 'user' })
    const { record } = await ops.track('Edit details', { mockupIds: [a] }, () => repo.mockups.addTagToMockup(a, tag.id))
    await run(record!.undo)
    repo.tags.deleteTag(tag.id)

    expect(await run(record!.redo)).toEqual({ ok: false, missing: { kind: 'tag', id: tag.id } })
  })

  it('an import whose mockups were deleted for good since', async () => {
    const [a] = [waiting('h1', 'to_sort')]
    const record = ops.importRecord('Import of 1 mockup', [a])
    repo.trash.deleteMockupsHard([a])
    expect(await run(record.undo)).toEqual({ ok: false, missing: { kind: 'mockup', id: a } })
  })

  it('records nothing for an action that changed nothing', async () => {
    const a = stashed('A')
    const { record } = await ops.track('Star', { mockupIds: [a] }, () => {})
    expect(record).toBeNull()
  })
})

describe('with the undo history', () => {
  it('Move to Trash, ⌘Z, ⇧⌘Z: the entry runs through these ops', async () => {
    const history = new UndoHistory<DataOp>(ops.runner)
    const id = stashed('Mug')
    const { record } = await ops.track('Move to Trash', { mockupIds: [id] }, () => repo.trash.moveManyToTrash([id]))
    history.record(record as UndoRecord<DataOp>)

    expect(await history.undo()).toEqual({ status: 'done', label: 'Move to Trash' })
    expect(repo.mockups.getMockup(id)?.deletedAt).toBeNull()
    expect(await history.redo()).toEqual({ status: 'done', label: 'Move to Trash' })
    expect(repo.mockups.getMockup(id)?.deletedAt).not.toBeNull()
  })
})
