import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../db/repository'
import type { NewMockup } from '../db/schema'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { PileTitles } from './pile-titles'

let sqlite: Database.Database
let repo: Repository
let titles: PileTitles

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  titles = new PileTitles(repo)
})

afterEach(() => sqlite.close())

/** A mockup that came in as `fileName`, titled `title`. */
const make = (fileName: string, title = fileName.replace(/\.psd$/, ''), extra: Partial<NewMockup> = {}) =>
  repo.mockups.createMockup(
    approvedMockup({
      title,
      libraryPath: `/lib/${fileName}`,
      importContext: { batchId: 'b', folderTrail: [], originalFilename: fileName },
      ...extra
    })
  ).id

/** A stashed pile of these files, the first on top, made the way it was before base titles. */
function pile(...files: string[]): number[] {
  const ids = files.map((f) => make(f))
  repo.piles.createPile(ids, ids[0]!)
  return ids
}

const row = (id: number) => {
  const m = repo.mockups.getMockup(id)!
  return { title: m.title, variation: m.variation, source: m.variationSource }
}
const variations = (ids: number[]) => ids.map((id) => repo.mockups.getMockup(id)!.variation)
const ftsTitle = (id: number) =>
  sqlite.prepare('SELECT title FROM mockups_fts WHERE rowid = ?').get(id) as { title: string } | undefined

describe('PileTitles.fill: a pile gets its base and every mockup a variation', () => {
  it('gives every mockup the top’s title as the base, and its file marker as the variation', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    repo.mockups.updateMockup(a!, { title: 'Canvas tote' })

    titles.fill(a!)

    expect(row(a!)).toEqual({ title: 'Canvas tote', variation: 'A', source: 'marker' })
    expect(row(b!)).toEqual({ title: 'Canvas tote', variation: 'B', source: 'marker' })
  })

  it('numbers the mockups in pile order when the names give no marker (the long scrolls)', () => {
    const ids = pile(
      'M003T1513 A long scroll Macbook Mockup 08Agu25.psd',
      'M003T1513 B long scroll Macbook Mockup 08Agu25.psd',
      'M003T1514 A long scroll Macbook Mockup 08Agu25.psd'
    )
    titles.fill(ids[0]!)
    expect(ids.map(row).map((r) => [r.variation, r.source])).toEqual([
      ['1', 'number'],
      ['2', 'number'],
      ['3', 'number']
    ])
  })

  it('indexes the full title for search', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    expect(ftsTitle(b!)?.title).toBe('tote-a · B')
  })

  it('gives the fallback to new members only: a joining mockup takes its marker, typed words stay', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    titles.setVariation(b!, 'on a hook')
    const c = make('tote-c.psd')
    repo.piles.addToPile(a!, [c])

    titles.fill(a!, [c])

    expect(variations([a!, b!, c])).toEqual(['A', 'on a hook', 'C'])
    expect(row(c).title).toBe('tote-a')
  })

  it('keeps a newcomer’s typed words and replaces its app words', () => {
    const [a] = pile('mug-1.psd', 'mug-2.psd')
    titles.fill(a!)
    const [x, y] = pile('cup-x.psd', 'cup-y.psd')
    titles.fill(x!)
    titles.setVariation(y!, 'steaming')
    repo.piles.mergePiles([x!], a!)

    titles.fill(a!, [x!, y!])

    expect(row(y!)).toEqual({ title: 'mug-1', variation: 'steaming', source: 'typed' })
    expect(row(x!)).toEqual({ title: 'mug-1', variation: 'X', source: 'marker' })
  })
})

describe('PileTitles.renameBase', () => {
  it('renames the pile and every mockup in it, exactly, and says what it was', () => {
    const ids = pile('tote-a.psd', 'tote-b.psd', 'tote-c.psd')
    titles.fill(ids[0]!)

    const result = titles.renameBase(ids[0]!, '  Canvas   tote ')

    expect(result).toEqual({ pileId: ids[0], base: 'Canvas tote', previous: 'tote-a', mockupIds: ids })
    expect(ids.map((id) => row(id).title)).toEqual(['Canvas tote', 'Canvas tote', 'Canvas tote'])
    expect(variations(ids)).toEqual(['A', 'B', 'C'])
    expect(ftsTitle(ids[2]!)?.title).toBe('Canvas tote · C')
  })

  it('refuses an empty base', () => {
    const [a] = pile('tote-a.psd', 'tote-b.psd')
    expect(() => titles.renameBase(a!, '   ')).toThrow()
  })
})

describe('a write that fails part-way changes nothing', () => {
  /** Lets the first write to a mockup through and fails the second, as a crash part-way would. */
  function failSecondWrite() {
    const write = repo.mockups.updateMockup.bind(repo.mockups)
    let n = 0
    vi.spyOn(repo.mockups, 'updateMockup').mockImplementation((id, data) => {
      if (++n === 2) throw new Error('disk full')
      write(id, data)
    })
  }

  it('renameBase: every mockup keeps its old title', () => {
    const ids = pile('tote-a.psd', 'tote-b.psd', 'tote-c.psd')
    titles.fill(ids[0]!)
    failSecondWrite()

    expect(() => titles.renameBase(ids[0]!, 'Canvas tote')).toThrow('disk full')

    expect(ids.map((id) => row(id).title)).toEqual(['tote-a', 'tote-a', 'tote-a'])
    expect(ftsTitle(ids[0]!)?.title).toBe('tote-a · A')
  })

  it('renameBase: a search update that fails leaves the old titles', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    vi.spyOn(repo.search, 'upsertSearchIndex').mockImplementation(() => {
      throw new Error('disk full')
    })

    expect(() => titles.renameBase(a!, 'Canvas tote')).toThrow('disk full')

    expect([row(a!).title, row(b!).title]).toEqual(['tote-a', 'tote-a'])
  })

  it('fill: no mockup takes its base or variation', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    repo.mockups.updateMockup(a!, { title: 'Canvas tote' })
    failSecondWrite()

    expect(() => titles.fill(a!)).toThrow('disk full')

    expect([row(a!), row(b!)]).toEqual([
      { title: 'Canvas tote', variation: null, source: null },
      { title: 'tote-b', variation: null, source: null }
    ])
  })

  it('landAi: every mockup keeps its variation', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    failSecondWrite()

    expect(() => titles.landAi(a!, new Map([[a!, 'front'], [b!, 'side']]))).toThrow('disk full')

    expect(variations([a!, b!])).toEqual(['A', 'B'])
  })

  it('leave: every mockup keeps its variation', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    repo.piles.disbandPile(a!)
    failSecondWrite()

    expect(() => titles.leave([a!, b!])).toThrow('disk full')

    expect([row(a!), row(b!)]).toEqual([
      { title: 'tote-a', variation: 'A', source: 'marker' },
      { title: 'tote-a', variation: 'B', source: 'marker' }
    ])
  })

  it('setVariation: a search update that fails leaves the old variation', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    vi.spyOn(repo.search, 'upsertSearchIndex').mockImplementation(() => {
      throw new Error('disk full')
    })

    expect(() => titles.setVariation(b!, 'side')).toThrow('disk full')

    expect(row(b!).variation).toBe('B')
  })
})

describe('PileTitles.setVariation', () => {
  it('keeps words a person typed exactly, even when another mockup has them', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    titles.setVariation(a!, 'side')

    const result = titles.setVariation(b!, 'side')

    expect(result).toEqual({
      mockupId: b,
      variation: { words: 'side', source: 'typed' },
      previous: { words: 'B', source: 'marker' }
    })
  })

  it('gives an emptied variation its file marker back', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    titles.setVariation(b!, 'on a hook')

    expect(titles.setVariation(b!, '  ').variation).toEqual({ words: 'B', source: 'marker' })
  })

  it('numbers the marker an emptied variation takes back when someone typed it elsewhere', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    titles.setVariation(a!, 'B')
    titles.setVariation(b!, 'hanging')

    expect(titles.setVariation(b!, '').variation).toEqual({ words: 'B 2', source: 'marker' })
  })

  it('leaves the source alone when the words did not change', () => {
    const [a] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    expect(titles.setVariation(a!, 'A').variation).toEqual({ words: 'A', source: 'marker' })
  })

  it('puts back exactly what Undo hands it, source included', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    titles.setVariation(b!, 'hanging')
    expect(titles.setVariation(b!, 'B', 'marker').variation).toEqual({ words: 'B', source: 'marker' })
  })

  it('refuses a mockup on its own', () => {
    const solo = make('poster.psd')
    expect(() => titles.setVariation(solo, 'front')).toThrow()
  })
})

describe('PileTitles.landAi: the AI’s words for a pile', () => {
  it('lands its words, numbering repeats, and gives "same" or no answer the fallback', () => {
    const ids = pile('tote-a.psd', 'tote-b.psd', 'tote-c.psd', 'tote-d.psd')
    titles.fill(ids[0]!)

    titles.landAi(
      ids[0]!,
      new Map([
        [ids[0]!, 'three-quarter'],
        [ids[1]!, 'side'],
        [ids[2]!, 'Side'],
        [ids[3]!, 'same']
      ])
    )

    expect(ids.map(row).map((r) => [r.variation, r.source])).toEqual([
      ['three-quarter', 'ai'],
      ['side', 'ai'],
      ['Side 2', 'ai'],
      ['D', 'marker']
    ])
  })

  it('never changes typed words, and numbers its own words when someone already typed them', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    titles.setVariation(a!, 'side')

    titles.landAi(a!, new Map([[a!, 'front'], [b!, 'side']]))

    expect(variations([a!, b!])).toEqual(['side', 'side 2'])
  })
})

describe('PileTitles.leave: a mockup that leaves its pile', () => {
  it('keeps its full title as its own and has no variation', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    repo.piles.removeFromPile(a!, b!)

    titles.leave([b!])

    expect(row(b!)).toEqual({ title: 'tote-a · B', variation: null, source: null })
    expect(ftsTitle(b!)?.title).toBe('tote-a · B')
  })
})

describe('PileTitles.settleAll: piles from before base titles', () => {
  it('takes the base from the top’s title and the variations from the fallback, for every pile', () => {
    const [a, b] = pile('tote-a.psd', 'tote-b.psd')
    repo.mockups.updateMockup(a!, { title: 'Long scroll Macbook' })
    repo.mockups.updateMockup(b!, { title: 'Blue scroll Macbook' })
    const solo = make('poster.psd')

    titles.settleAll()

    expect(row(a!)).toEqual({ title: 'Long scroll Macbook', variation: 'A', source: 'marker' })
    expect(row(b!)).toEqual({ title: 'Long scroll Macbook', variation: 'B', source: 'marker' })
    expect(row(solo)).toEqual({ title: 'poster', variation: null, source: null })
  })

  it('folds a variation left on a mockup on its own into its title', () => {
    const solo = make('poster.psd', 'Poster', { variation: 'front', variationSource: 'ai' })
    titles.settleAll()
    expect(row(solo)).toEqual({ title: 'Poster · front', variation: null, source: null })
  })

  it('changes nothing the second time', () => {
    const [a] = pile('tote-a.psd', 'tote-b.psd')
    titles.settleAll()
    sqlite.exec(`UPDATE mockups SET updated_at = '2000-01-01'`)
    titles.settleAll()
    expect(repo.mockups.getMockup(a!)!.updatedAt).toBe('2000-01-01')
  })
})

describe('a pile waiting in To stash: its titles live in its drafts', () => {
  function waitingPile(...files: string[]): number[] {
    const ids = files.map((f) => make(f, f, { stage: 'to_stash' }))
    repo.piles.createPile(ids, ids[0]!)
    for (const id of ids) repo.drafts.ensureDraft(id, { title: `draft ${id}`, description: '', tagIds: [] })
    return ids
  }
  const draft = (id: number) => repo.drafts.getDraft(id)!

  it('fills the drafts: the top draft’s title is the base, and each gets its marker', () => {
    const [a, b] = waitingPile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    expect([draft(a!).title, draft(b!).title]).toEqual([`draft ${a}`, `draft ${a}`])
    expect([draft(a!).variation, draft(b!).variation]).toEqual(['A', 'B'])
    // The mockups themselves wait for Stash pile.
    expect(row(b!).variation).toBeNull()
  })

  it('renames every draft exactly, and a person’s base is kept from a late suggestion', () => {
    const [a, b] = waitingPile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)

    titles.renameBase(a!, 'Canvas tote')

    expect([draft(a!).title, draft(b!).title]).toEqual(['Canvas tote', 'Canvas tote'])
    expect(draft(a!).keptFields).toContain('title')
    expect(draft(b!).keptFields).toContain('title')
  })

  it('a rename that fails part-way leaves every draft its old title', () => {
    const [a, b] = waitingPile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    const write = repo.drafts.updateDraft.bind(repo.drafts)
    let n = 0
    vi.spyOn(repo.drafts, 'updateDraft').mockImplementation((id, patch) => {
      if (++n === 2) throw new Error('disk full')
      write(id, patch)
    })

    expect(() => titles.renameBase(a!, 'Canvas tote')).toThrow('disk full')

    expect([draft(a!).title, draft(b!).title]).toEqual([`draft ${a}`, `draft ${a}`])
    expect(draft(a!).keptFields).not.toContain('title')
  })

  it('an AI base renames the drafts without keeping it', () => {
    const [a, b] = waitingPile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    titles.renameBase(a!, 'Canvas tote', 'ai')
    expect(draft(b!).title).toBe('Canvas tote')
    expect(draft(b!).keptFields).not.toContain('title')
  })

  it('sets one draft’s variation', () => {
    const [a, b] = waitingPile('tote-a.psd', 'tote-b.psd')
    titles.fill(a!)
    titles.setVariation(b!, 'on a hook')
    expect([draft(b!).variation, draft(b!).variationSource]).toEqual(['on a hook', 'typed'])
  })
})

describe('PileTitles.provisionalBase: the pile’s name until the AI writes one', () => {
  const waiting = (fileName: string, ctx: Record<string, unknown> = {}) =>
    make(fileName, fileName, {
      stage: 'to_stash',
      importContext: { batchId: 'b', folderTrail: [], originalFilename: fileName, ...ctx }
    })

  it('is the zip or folder the Sort board named the pile after', () => {
    const a = waiting('w1.psd', { archiveTitle: 'Apple Watch Ultra Mockup' })
    const b = waiting('w2.psd', { archiveTitle: 'Apple Watch Ultra Mockup' })
    repo.piles.createPile([a, b], a)
    expect(titles.provisionalBase(a)).toBe('Apple Watch Ultra Mockup')

    const c = waiting('c1.psd', { folderTrail: ['iPhone 15 Clay'] })
    const d = waiting('c2.psd', { folderTrail: ['iPhone 15 Clay'] })
    repo.piles.createPile([c, d], c)
    expect(titles.provisionalBase(c)).toBe('iPhone 15 Clay')
  })

  it('is the shared start of the names, or the top’s name, without separators or extension', () => {
    const a = waiting('oval-mug_front.psd')
    const b = waiting('oval-mug_back.psd')
    repo.piles.createPile([a, b], a)
    expect(titles.provisionalBase(a)).toBe('oval mug')

    const c = waiting('poster_a3.psd')
    const d = waiting('flyer.psd')
    repo.piles.createPile([c, d], c)
    expect(titles.provisionalBase(c)).toBe('poster a3')
  })
})
