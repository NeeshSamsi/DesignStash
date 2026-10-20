import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../repository'
import { ensureSearchIndex } from '../search-index'
import { approvedMockup, batchSample, createTestDb } from './__tests__/setup'
import { pileRole } from './piles'

let sqlite: Database.Database
let repo: Repository

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
})

afterEach(() => sqlite.close())

describe('confirmGroupings', () => {
  it('sets leader isGroup=true and members groupId=leader, singletons cleared', () => {
    const m1 = repo.mockups.createMockup({ ...batchSample('b'), title: 'M1', libraryPath: '/lib/m1.psd' })
    const m2 = repo.mockups.createMockup({ ...batchSample('b'), title: 'M2', libraryPath: '/lib/m2.psd' })
    const m3 = repo.mockups.createMockup({ ...batchSample('b'), title: 'M3', libraryPath: '/lib/m3.psd' })
    const m4 = repo.mockups.createMockup({ ...batchSample('b'), title: 'M4', libraryPath: '/lib/m4.psd' })

    repo.piles.confirmGroupings([{ id: 'g1', memberIds: [m1.id, m2.id, m3.id] }], [m4.id])

    expect(repo.mockups.getMockup(m1.id)).toMatchObject({ isGroup: true, groupId: null })
    expect(repo.mockups.getMockup(m2.id)).toMatchObject({ isGroup: false, groupId: m1.id })
    expect(repo.mockups.getMockup(m3.id)).toMatchObject({ isGroup: false, groupId: m1.id })
    expect(repo.mockups.getMockup(m4.id)).toMatchObject({ isGroup: false, groupId: null })
  })
})

describe('ungroupGroup', () => {
  it('sets leader isGroup=false and clears all members groupId', () => {
    const leader = repo.mockups.createMockup(
      approvedMockup({ title: 'Leader', libraryPath: '/lib/ug-l.psd', isGroup: true })
    )
    const m1 = repo.mockups.createMockup(
      approvedMockup({ title: 'M1', libraryPath: '/lib/ug-m1.psd', groupId: leader.id })
    )
    const m2 = repo.mockups.createMockup(
      approvedMockup({ title: 'M2', libraryPath: '/lib/ug-m2.psd', groupId: leader.id })
    )

    repo.piles.ungroupGroup(leader.id)

    expect(repo.mockups.getMockup(leader.id)?.isGroup).toBe(false)
    expect(repo.mockups.getMockup(m1.id)?.groupId).toBeNull()
    expect(repo.mockups.getMockup(m2.id)?.groupId).toBeNull()
    // rows still exist
    expect(repo.mockups.getMockup(m1.id)).toBeDefined()
    expect(repo.mockups.getMockup(m2.id)).toBeDefined()
  })
})

describe('pileRole', () => {
  it('reads a top, a member and a row on its own', () => {
    expect(pileRole({ isGroup: true, groupId: null })).toBe('top')
    expect(pileRole({ isGroup: false, groupId: 3 })).toBe('member')
    expect(pileRole({ isGroup: false, groupId: null })).toBe('alone')
  })
})

describe('pile operations', () => {
  // Whatever a test did, no row is both a top and a member, and every member points at a top.
  afterEach(() => {
    const rows = sqlite
      .prepare('SELECT id, is_group AS isGroup, group_id AS groupId FROM mockups')
      .all() as { id: number; isGroup: number; groupId: number | null }[]
    const byId = new Map(rows.map((r) => [r.id, r]))
    for (const r of rows) {
      expect(r.isGroup === 1 && r.groupId !== null, `row ${r.id} is a top and a member`).toBe(false)
      if (r.groupId !== null) {
        const top = byId.get(r.groupId)
        expect(top?.isGroup, `row ${r.id} points at ${r.groupId}, which is not a top`).toBe(1)
      }
    }
  })

  const standalone = (title: string) =>
    repo.mockups.createMockup(approvedMockup({ title, libraryPath: `/lib/${title}.psd` }))

  const state = (ids: number[]) =>
    ids.map((id) => {
      const m = repo.mockups.getMockup(id)!
      return { id, isGroup: m.isGroup, groupId: m.groupId }
    })

  describe('createPile', () => {
    it('makes the top the leader and the rest its members', () => {
      const [a, b, c] = [standalone('a'), standalone('b'), standalone('c')]
      const result = repo.piles.createPile([a!.id, b!.id, c!.id], b!.id)

      expect(result.pileId).toBe(b!.id)
      expect(state([a!.id, b!.id, c!.id])).toEqual([
        { id: a!.id, isGroup: false, groupId: b!.id },
        { id: b!.id, isGroup: true, groupId: null },
        { id: c!.id, isGroup: false, groupId: b!.id }
      ])
    })

    it('returns the earlier state of every row it touched', () => {
      const [a, b] = [standalone('a'), standalone('b')]
      const { before } = repo.piles.createPile([a!.id, b!.id], a!.id)
      expect(before).toEqual([
        { id: a!.id, isGroup: false, groupId: null },
        { id: b!.id, isGroup: false, groupId: null }
      ])
    })

    it('needs two or more mockups and the top among them', () => {
      const [a, b, c] = [standalone('a'), standalone('b'), standalone('c')]
      expect(() => repo.piles.createPile([a!.id], a!.id)).toThrow()
      expect(() => repo.piles.createPile([a!.id, b!.id], c!.id)).toThrow()
      expect(() => repo.piles.createPile([a!.id, a!.id], a!.id)).toThrow()
    })

    it('refuses mockups that are missing, in Trash or already in a pile', () => {
      const [a, b, c, d] = [standalone('a'), standalone('b'), standalone('c'), standalone('d')]
      repo.piles.createPile([c!.id, d!.id], c!.id)
      repo.trash.moveToTrash(b!.id)

      expect(() => repo.piles.createPile([a!.id, 9999], a!.id)).toThrow()
      expect(() => repo.piles.createPile([a!.id, b!.id], a!.id)).toThrow()
      expect(() => repo.piles.createPile([a!.id, c!.id], a!.id)).toThrow()
      expect(() => repo.piles.createPile([a!.id, d!.id], a!.id)).toThrow()
      expect(state([a!.id])).toEqual([{ id: a!.id, isGroup: false, groupId: null }])
    })
  })

  describe('addToPile', () => {
    it('adds standalone mockups as members of the pile', () => {
      const [a, b, c, d] = [standalone('a'), standalone('b'), standalone('c'), standalone('d')]
      const { pileId } = repo.piles.createPile([a!.id, b!.id], a!.id)

      const result = repo.piles.addToPile(pileId, [c!.id, d!.id])

      expect(result.pileId).toBe(a!.id)
      expect(
        repo
          .piles.getMockupsByGroupId(a!.id)
          .map((m) => m.id)
          .sort()
      ).toEqual([b!.id, c!.id, d!.id].sort())
      expect(result.before).toEqual([
        { id: c!.id, isGroup: false, groupId: null },
        { id: d!.id, isGroup: false, groupId: null }
      ])
    })

    it('refuses a target that is not a pile, or members that are not on their own', () => {
      const [a, b, c, d] = [standalone('a'), standalone('b'), standalone('c'), standalone('d')]
      const { pileId } = repo.piles.createPile([a!.id, b!.id], a!.id)
      repo.piles.createPile([c!.id, d!.id], c!.id)

      expect(() => repo.piles.addToPile(b!.id, [c!.id])).toThrow()
      expect(() => repo.piles.addToPile(pileId, [pileId])).toThrow()
      expect(() => repo.piles.addToPile(pileId, [c!.id])).toThrow()
      expect(() => repo.piles.addToPile(pileId, [d!.id])).toThrow()
      expect(() => repo.piles.addToPile(pileId, [])).toThrow()
    })
  })

  describe('mergePiles', () => {
    it('folds the source piles into the target and keeps the target top', () => {
      const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(standalone)
      const target = repo.piles.createPile([a!.id, b!.id], a!.id)
      const source = repo.piles.createPile([c!.id, d!.id], c!.id)

      const result = repo.piles.mergePiles([source.pileId], target.pileId)

      expect(result.pileId).toBe(a!.id)
      expect(state([a!.id, b!.id, c!.id, d!.id, e!.id])).toEqual([
        { id: a!.id, isGroup: true, groupId: null },
        { id: b!.id, isGroup: false, groupId: a!.id },
        { id: c!.id, isGroup: false, groupId: a!.id },
        { id: d!.id, isGroup: false, groupId: a!.id },
        { id: e!.id, isGroup: false, groupId: null }
      ])
    })

    it('takes a mockup on its own as a source too, and several sources at once', () => {
      const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(standalone)
      const target = repo.piles.createPile([a!.id, b!.id], a!.id)
      const source = repo.piles.createPile([c!.id, d!.id], c!.id)

      repo.piles.mergePiles([source.pileId, e!.id], target.pileId)

      expect(
        repo
          .piles.getMockupsByGroupId(a!.id)
          .map((m) => m.id)
          .sort()
      ).toEqual([b!.id, c!.id, d!.id, e!.id].sort())
    })

    it('restores to the earlier state from the returned rows', () => {
      const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(standalone)
      const target = repo.piles.createPile([a!.id, b!.id], a!.id)
      const source = repo.piles.createPile([c!.id, d!.id], c!.id)
      const ids = [a!.id, b!.id, c!.id, d!.id]
      const earlier = state(ids)

      const { before } = repo.piles.mergePiles([source.pileId], target.pileId)
      repo.piles.restorePileRows(before)

      expect(state(ids)).toEqual(earlier)
    })

    it('refuses a target that is not a pile, itself as a source, or no sources', () => {
      const [a, b, c] = ['a', 'b', 'c'].map(standalone)
      const target = repo.piles.createPile([a!.id, b!.id], a!.id)

      expect(() => repo.piles.mergePiles([target.pileId], c!.id)).toThrow()
      expect(() => repo.piles.mergePiles([target.pileId], target.pileId)).toThrow()
      expect(() => repo.piles.mergePiles([], target.pileId)).toThrow()
      expect(() => repo.piles.mergePiles([b!.id], target.pileId)).toThrow()
    })
  })

  describe('setPileTop', () => {
    it('hands the pile to the new top and keeps every mockup in it', () => {
      const [a, b, c] = ['a', 'b', 'c'].map(standalone)
      const { pileId } = repo.piles.createPile([a!.id, b!.id, c!.id], a!.id)

      const result = repo.piles.setPileTop(pileId, c!.id)

      expect(result.pileId).toBe(c!.id)
      expect(state([a!.id, b!.id, c!.id])).toEqual([
        { id: a!.id, isGroup: false, groupId: c!.id },
        { id: b!.id, isGroup: false, groupId: c!.id },
        { id: c!.id, isGroup: true, groupId: null }
      ])
    })

    it('carries the star over to the new top', () => {
      const [a, b] = [standalone('a'), standalone('b')]
      const { pileId } = repo.piles.createPile([a!.id, b!.id], a!.id)
      repo.mockups.setFavourite(pileId, true)

      repo.piles.setPileTop(pileId, b!.id)

      expect(repo.mockups.getMockup(b!.id)?.favourite).toBe(true)
      expect(repo.mockups.getMockup(a!.id)?.favourite).toBe(false)
    })

    it('is a no-op when the mockup is already on top', () => {
      const [a, b] = [standalone('a'), standalone('b')]
      const { pileId } = repo.piles.createPile([a!.id, b!.id], a!.id)
      const result = repo.piles.setPileTop(pileId, a!.id)
      expect(result.pileId).toBe(a!.id)
      expect(state([a!.id, b!.id])).toEqual([
        { id: a!.id, isGroup: true, groupId: null },
        { id: b!.id, isGroup: false, groupId: a!.id }
      ])
    })

    it('refuses a mockup that is not in the pile', () => {
      const [a, b, c] = ['a', 'b', 'c'].map(standalone)
      const { pileId } = repo.piles.createPile([a!.id, b!.id], a!.id)
      expect(() => repo.piles.setPileTop(pileId, c!.id)).toThrow()
      expect(() => repo.piles.setPileTop(b!.id, a!.id)).toThrow()
    })
  })

  describe('disbandPile', () => {
    it('frees every mockup and returns the rows that bring the pile back', () => {
      const [a, b, c] = ['a', 'b', 'c'].map(standalone)
      const { pileId } = repo.piles.createPile([a!.id, b!.id, c!.id], b!.id)
      const ids = [a!.id, b!.id, c!.id]
      const pileState = state(ids)

      const result = repo.piles.disbandPile(pileId)

      expect(result.freedIds.sort()).toEqual(ids.sort())
      expect(state(ids)).toEqual(ids.map((id) => ({ id, isGroup: false, groupId: null })))

      repo.piles.restorePileRows(result.before)
      expect(state(ids)).toEqual(pileState)
    })

    it('refuses something that is not a pile', () => {
      const [a, b] = [standalone('a'), standalone('b')]
      const { pileId } = repo.piles.createPile([a!.id, b!.id], a!.id)
      expect(() => repo.piles.disbandPile(b!.id)).toThrow()
      expect(pileId).toBe(a!.id)
    })
  })

  describe('removeFromPile', () => {
    it('takes a member out; the pile and its top stay', () => {
      const [a, b, c] = ['a', 'b', 'c'].map(standalone)
      const ids = [a!.id, b!.id, c!.id]
      const { pileId } = repo.piles.createPile(ids, a!.id)

      const result = repo.piles.removeFromPile(pileId, c!.id)

      expect(result).toMatchObject({ pileId: a!.id, freedIds: [c!.id] })
      expect(state(ids)).toEqual([
        { id: a!.id, isGroup: true, groupId: null },
        { id: b!.id, isGroup: false, groupId: a!.id },
        { id: c!.id, isGroup: false, groupId: null }
      ])
    })

    it('promotes the next mockup when the top is removed', () => {
      const [a, b, c] = ['a', 'b', 'c'].map(standalone)
      const ids = [a!.id, b!.id, c!.id]
      const { pileId } = repo.piles.createPile(ids, a!.id)

      const result = repo.piles.removeFromPile(pileId, a!.id)

      // The lowest id among the rest, as the pile lists them.
      expect(result).toMatchObject({ pileId: b!.id, freedIds: [a!.id] })
      expect(state(ids)).toEqual([
        { id: a!.id, isGroup: false, groupId: null },
        { id: b!.id, isGroup: true, groupId: null },
        { id: c!.id, isGroup: false, groupId: b!.id }
      ])
    })

    it('leaves each mockup’s own star where it is', () => {
      const [a, b, c] = ['a', 'b', 'c'].map(standalone)
      const { pileId } = repo.piles.createPile([a!.id, b!.id, c!.id], a!.id)
      repo.mockups.setFavourite(a!.id, true)
      repo.piles.removeFromPile(pileId, a!.id)
      expect(repo.mockups.getMockup(a!.id)?.favourite).toBe(true)
      expect(repo.mockups.getMockup(b!.id)?.favourite).toBe(false)
    })

    it('stops being a pile when one mockup would be left: both are on their own', () => {
      const [a, b] = ['a', 'b'].map(standalone)
      const ids = [a!.id, b!.id]
      const { pileId } = repo.piles.createPile(ids, a!.id)

      const result = repo.piles.removeFromPile(pileId, b!.id)

      expect(result.pileId).toBeNull()
      expect(result.freedIds.sort()).toEqual([...ids].sort())
      expect(state(ids)).toEqual(ids.map((id) => ({ id, isGroup: false, groupId: null })))
    })

    it('does the same when the top is the one removed from a pile of two', () => {
      const [a, b] = ['a', 'b'].map(standalone)
      const ids = [a!.id, b!.id]
      const { pileId } = repo.piles.createPile(ids, a!.id)
      const result = repo.piles.removeFromPile(pileId, a!.id)
      expect(result.pileId).toBeNull()
      expect(state(ids)).toEqual(ids.map((id) => ({ id, isGroup: false, groupId: null })))
    })

    it('returns the rows that bring the pile back', () => {
      for (const removed of [0, 1, 2]) {
        const made = ['x', 'y', 'z'].map((t) => standalone(`${t}${removed}`))
        const ids = made.map((m) => m.id)
        const { pileId } = repo.piles.createPile(ids, ids[0]!)
        const before = state(ids)
        const result = repo.piles.removeFromPile(pileId, ids[removed]!)
        repo.piles.restorePileRows(result.before)
        expect(state(ids)).toEqual(before)
      }
    })

    it('refuses something that is not a pile, or a mockup that is not in it', () => {
      const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(standalone)
      const { pileId } = repo.piles.createPile([a!.id, b!.id], a!.id)
      expect(() => repo.piles.removeFromPile(c!.id, d!.id)).toThrow()
      expect(() => repo.piles.removeFromPile(pileId, c!.id)).toThrow()
    })
  })

  describe('restorePileRows', () => {
    it('skips rows that no longer exist', () => {
      const [a, b] = [standalone('a'), standalone('b')]
      const { before } = repo.piles.createPile([a!.id, b!.id], a!.id)
      repo.trash.deleteMockupsHard([b!.id])

      expect(() => repo.piles.restorePileRows(before)).not.toThrow()
      expect(state([a!.id])).toEqual([{ id: a!.id, isGroup: false, groupId: null }])
    })
  })
})
