import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../repository'
import { approvedMockup, batchSample, createTestDb } from './__tests__/setup'

let sqlite: Database.Database
let repo: Repository

beforeEach(() => {
  ;({ sqlite, repo } = createTestDb())
})

afterEach(() => sqlite.close())

describe('confirmGroupings', () => {
  it('sets leader isGroup=true and members groupId=leader, singletons cleared', () => {
    const m1 = repo.createMockup({ ...batchSample('b'), title: 'M1', libraryPath: '/lib/m1.psd' })
    const m2 = repo.createMockup({ ...batchSample('b'), title: 'M2', libraryPath: '/lib/m2.psd' })
    const m3 = repo.createMockup({ ...batchSample('b'), title: 'M3', libraryPath: '/lib/m3.psd' })
    const m4 = repo.createMockup({ ...batchSample('b'), title: 'M4', libraryPath: '/lib/m4.psd' })

    repo.confirmGroupings([{ id: 'g1', memberIds: [m1.id, m2.id, m3.id] }], [m4.id])

    expect(repo.getMockup(m1.id)).toMatchObject({ isGroup: true, groupId: null })
    expect(repo.getMockup(m2.id)).toMatchObject({ isGroup: false, groupId: m1.id })
    expect(repo.getMockup(m3.id)).toMatchObject({ isGroup: false, groupId: m1.id })
    expect(repo.getMockup(m4.id)).toMatchObject({ isGroup: false, groupId: null })
  })
})

describe('ungroupGroup', () => {
  it('sets leader isGroup=false and clears all members groupId', () => {
    const leader = repo.createMockup(
      approvedMockup({ title: 'Leader', libraryPath: '/lib/ug-l.psd', isGroup: true })
    )
    const m1 = repo.createMockup(
      approvedMockup({ title: 'M1', libraryPath: '/lib/ug-m1.psd', groupId: leader.id })
    )
    const m2 = repo.createMockup(
      approvedMockup({ title: 'M2', libraryPath: '/lib/ug-m2.psd', groupId: leader.id })
    )

    repo.ungroupGroup(leader.id)

    expect(repo.getMockup(leader.id)?.isGroup).toBe(false)
    expect(repo.getMockup(m1.id)?.groupId).toBeNull()
    expect(repo.getMockup(m2.id)?.groupId).toBeNull()
    // rows still exist
    expect(repo.getMockup(m1.id)).toBeDefined()
    expect(repo.getMockup(m2.id)).toBeDefined()
  })
})
