import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../repository'
import { ensureSearchIndex } from '../search-index'
import { createTestDb, sample } from './__tests__/setup'

let sqlite: Database.Database
let repo: Repository
let db: ReturnType<typeof createTestDb>['db']

beforeEach(() => {
  ;({ sqlite, repo, db } = createTestDb())
  ensureSearchIndex(db)
})
afterEach(() => sqlite.close())

const stashed = (title: string, path: string) =>
  repo.mockups.createMockup({ ...sample, title, libraryPath: path, stage: 'stashed' })

describe('EmbeddingRepository', () => {
  it('stores a vector and reads it back with its hash', () => {
    const m = stashed('Tote', '/lib/e/a.psd')
    repo.embeddings.upsert(m.id, 'nomic', [0.5, 0.25, -1], 'h1')
    expect(repo.embeddings.hashOf(m.id, 'nomic')).toBe('h1')
    const vectors = repo.embeddings.vectors('nomic')
    expect([...vectors.get(m.id)!]).toEqual([0.5, 0.25, -1])
  })

  it('replaces the vector and hash when the text changes', () => {
    const m = stashed('Tote', '/lib/e/b.psd')
    repo.embeddings.upsert(m.id, 'nomic', [1, 0], 'h1')
    repo.embeddings.upsert(m.id, 'nomic', [0, 1], 'h2')
    expect(repo.embeddings.hashOf(m.id, 'nomic')).toBe('h2')
    expect([...repo.embeddings.vectors('nomic').get(m.id)!]).toEqual([0, 1])
    expect(repo.embeddings.count('nomic')).toBe(1)
  })

  it('keeps vectors of other models apart', () => {
    const m = stashed('Tote', '/lib/e/c.psd')
    repo.embeddings.upsert(m.id, 'nomic', [1, 0], 'h1')
    expect(repo.embeddings.hashOf(m.id, 'other')).toBeNull()
    expect(repo.embeddings.vectors('other').size).toBe(0)
  })

  it('goes with the mockup: trash and delete remove the vector', () => {
    const a = stashed('A', '/lib/e/d.psd')
    const b = stashed('B', '/lib/e/e.psd')
    repo.search.upsertSearchIndex(a.id)
    repo.search.upsertSearchIndex(b.id)
    repo.embeddings.upsert(a.id, 'nomic', [1, 0], 'h')
    repo.embeddings.upsert(b.id, 'nomic', [1, 0], 'h')

    repo.search.removeSearchIndex(a.id)
    expect(repo.embeddings.hashOf(a.id, 'nomic')).toBeNull()

    sqlite.prepare('DELETE FROM mockups WHERE id = ?').run(b.id)
    expect(repo.embeddings.count('nomic')).toBe(0)
  })

  it('rebuildSearchIndex drops vectors of mockups that are not stashed any more', () => {
    const a = stashed('A', '/lib/e/f.psd')
    const b = stashed('B', '/lib/e/g.psd')
    repo.embeddings.upsert(a.id, 'nomic', [1, 0], 'h')
    repo.embeddings.upsert(b.id, 'nomic', [1, 0], 'h')
    repo.mockups.updateMockup(b.id, { deletedAt: new Date().toISOString() })
    repo.search.rebuildSearchIndex()
    expect([...repo.embeddings.vectors('nomic').keys()]).toEqual([a.id])
  })
})

describe('SearchRepository meaning documents', () => {
  it('lists the text of every stashed mockup, tags included', () => {
    const m = stashed('Black sweatshirt', '/lib/e/h.psd')
    repo.mockups.updateMockup(m.id, { description: 'A raglan sweatshirt.' })
    const tag = repo.tags.getAllTags()[0]
    expect(repo.search.meaningDocuments()).toEqual([
      { id: m.id, text: 'Black sweatshirt. A raglan sweatshirt.' }
    ])
    expect(tag).toBeUndefined()
  })

  it('tells a listener the new text when a mockup is indexed', () => {
    const seen: [number, string][] = []
    repo.search.setIndexListener((id, text) => seen.push([id, text]))
    const m = stashed('Tote bag', '/lib/e/i.psd')
    repo.search.upsertSearchIndex(m.id)
    expect(seen).toEqual([[m.id, 'Tote bag']])
  })
})
