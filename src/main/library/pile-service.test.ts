import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { PileService } from './pile-service'
import { PileTitles } from './pile-titles'

let sqlite: Database.Database
let repo: Repository
let piles: PileService

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  piles = new PileService(repo)
})

afterEach(() => sqlite.close())

// Undo of each pile action, titles included, goes through its history entry (undo/ops/ops.test.ts).
describe('PileService: base titles and variations (design/specs/pile-titles.md)', () => {
  /** A stashed mockup that came in as `fileName`. */
  const file = (fileName: string, title = fileName.replace(/\.psd$/, '')) =>
    repo.mockups.createMockup(
      approvedMockup({
        title,
        libraryPath: `/lib/${fileName}`,
        importContext: { batchId: 'b', folderTrail: [], originalFilename: fileName }
      })
    ).id
  const titleOf = (id: number) => {
    const m = repo.mockups.getMockup(id)!
    return [m.title, m.variation, m.variationSource]
  }
  const ftsTitle = (id: number) =>
    (
      sqlite.prepare('SELECT title FROM mockups_fts WHERE rowid = ?').get(id) as
        | { title: string }
        | undefined
    )?.title

  it('a new pile takes its top’s title as the base, and each mockup its file marker', () => {
    const [a, b] = [file('tote-a.psd', 'Canvas tote'), file('tote-b.psd', 'Tote on a hook')]
    piles.create([a, b], a)
    expect([titleOf(a), titleOf(b)]).toEqual([
      ['Canvas tote', 'A', 'marker'],
      ['Canvas tote', 'B', 'marker']
    ])
    expect(ftsTitle(b)).toBe('Canvas tote · B')
  })

  it('a mockup that joins takes the base and its marker, and the rest keep theirs', () => {
    const [a, b, c] = [file('tote-a.psd'), file('tote-b.psd'), file('tote-c.psd')]
    const { pileId } = piles.create([a, b], a)
    new PileTitles(repo).setVariation(b, 'on a hook')

    piles.add(pileId, [c])

    expect([titleOf(b), titleOf(c)]).toEqual([
      ['tote-a', 'on a hook', 'typed'],
      ['tote-a', 'C', 'marker']
    ])
  })

  it('a merge keeps what a person typed on the mockups that join', () => {
    const [a, b, c, d] = [
      file('mug-1.psd'),
      file('mug-2.psd'),
      file('cup-x.psd'),
      file('cup-y.psd')
    ]
    const target = piles.create([a, b], a)
    const source = piles.create([c, d], c)
    new PileTitles(repo).setVariation(d, 'steaming')

    piles.merge([source.pileId], target.pileId)

    expect([titleOf(c), titleOf(d)]).toEqual([
      ['mug-1', 'X', 'marker'],
      ['mug-1', 'steaming', 'typed']
    ])
  })

  it('Put on top leaves every title as it is', () => {
    const [a, b] = [file('tote-a.psd'), file('tote-b.psd')]
    const { pileId } = piles.create([a, b], a)
    piles.setTop(pileId, b)
    expect([titleOf(a), titleOf(b)]).toEqual([
      ['tote-a', 'A', 'marker'],
      ['tote-a', 'B', 'marker']
    ])
  })

  it('a mockup taken out keeps its full title as its own', () => {
    const [a, b, c] = [file('tote-a.psd'), file('tote-b.psd'), file('tote-c.psd')]
    const { pileId } = piles.create([a, b, c], a)

    piles.removeFromPile(pileId, c)
    expect(titleOf(c)).toEqual(['tote-a · C', null, null])
    expect(ftsTitle(c)).toBe('tote-a · C')
  })

  it('a disband gives every mockup its full title', () => {
    const [a, b] = [file('tote-a.psd', 'Canvas tote'), file('tote-b.psd')]
    const { pileId } = piles.create([a, b], a)

    piles.disband(pileId)
    expect([titleOf(a), titleOf(b)]).toEqual([
      ['Canvas tote · A', null, null],
      ['Canvas tote · B', null, null]
    ])
  })
})
