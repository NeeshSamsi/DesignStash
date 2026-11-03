import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from './repository'
import { batchSample, createTestDb } from './repositories/__tests__/setup'

let sqlite: Database.Database
let repo: Repository

beforeEach(() => {
  ;({ sqlite, repo } = createTestDb())
})

afterEach(() => sqlite.close())

const waiting = (n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      repo.mockups.createMockup({
        ...batchSample('b1'),
        libraryPath: `/lib/${i}.psd`,
        stage: 'to_sort'
      }).id
  )

describe('Repository.transaction', () => {
  it('keeps every write when nothing throws', () => {
    const [a, b] = waiting(2) as [number, number]
    repo.transaction(() => {
      repo.piles.confirmGroupings([{ id: 'p', memberIds: [a, b] }], [])
      repo.mockups.setStage([a, b], 'to_stash')
    })
    expect(repo.mockups.getMockup(a)).toMatchObject({ isGroup: true, stage: 'to_stash' })
    expect(repo.mockups.getMockup(b)).toMatchObject({ groupId: a, stage: 'to_stash' })
  })

  it('undoes a repository’s own finished transaction when a later step throws', () => {
    const [a, b] = waiting(2) as [number, number]
    expect(() =>
      repo.transaction(() => {
        repo.piles.confirmGroupings([{ id: 'p', memberIds: [a, b] }], [])
        throw new Error('power cut')
      })
    ).toThrow('power cut')
    expect(repo.mockups.getMockup(a)).toMatchObject({ isGroup: false, groupId: null })
    expect(repo.mockups.getMockup(b)).toMatchObject({ groupId: null })
  })

  it('answers with what the step returns', () => {
    expect(repo.transaction(() => 7)).toBe(7)
  })
})
