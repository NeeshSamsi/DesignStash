import {
  fallbackVariations,
  fullTitle,
  numberRepeats,
  saysSame,
  tidyWords,
  type Variation,
  type VariationSource
} from '@shared/pile-variation'
import { pileTitle } from '@shared/pile-title'
import type { Repository } from '../db/repository'
import type { Draft, Mockup } from '../db/schema'

/** One mockup's part of its pile's titles, wherever they live now. */
interface TitleRow {
  id: number
  fileName: string
  /** The pile's base, as this row holds it. */
  title: string
  variation: Variation | null
  draft: Draft | null
}

/** A pile's titles: in its drafts while it waits in To stash, on its rows once stashed. */
interface PileRows {
  pileId: number
  inDrafts: boolean
  /** Pile order: the top first, then the rest by id. */
  rows: TitleRow[]
}

/** What renaming a pile did, for the renderer and its Undo. */
export interface RenameResult {
  pileId: number
  base: string
  /** The base before, for Undo. */
  previous: string
  /** Every mockup whose title changed. */
  mockupIds: number[]
}

/** What setting a variation did. */
export interface VariationResult {
  mockupId: number
  variation: Variation
  /** The variation before, for Undo. */
  previous: Variation | null
}

const fileNameOf = (m: Mockup) =>
  (m.importContext as { originalFilename?: string } | null)?.originalFilename ?? m.title

const variationOf = (row: { variation: string | null; variationSource: VariationSource | null }): Variation | null =>
  row.variation ? { words: row.variation, source: row.variationSource ?? 'ai' } : null

/** A name as a title: separators to spaces, the extension and any trailing ellipsis gone. */
const asTitle = (name: string) =>
  name
    .replace(/…$/, '')
    .replace(/\.ps[db]$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * A pile's base title and each mockup's variation (design/specs/pile-titles.md, "Base title and
 * variations"). The base belongs to the pile: every row in a pile holds it as its `title`, and
 * renaming it renames them all, exactly. The variation belongs to the mockup. While a pile waits in
 * To stash both live in its drafts, and Stash pile writes them to the mockups. Each change runs in
 * one transaction with its search updates, so one that fails part-way leaves every title as it was.
 */
export class PileTitles {
  constructor(private readonly repo: Repository) {}

  /**
   * Make a pile's titles whole: every row takes the top's title as the base, and the mockups in
   * `ids` (by default those with no variation) take their file marker or number, numbered where
   * another mockup already has those words. Typed words are kept. Returns the mockups it changed.
   */
  fill(pileId: number, ids?: number[]): number[] {
    const pile = this.rowsOf(pileId)
    if (!pile) return []
    const { rows } = pile
    const base = rows[0]!.title
    const asked = ids ? new Set(ids) : null
    const filling = rows.filter((r) => (asked ? asked.has(r.id) : r.variation === null) && r.variation?.source !== 'typed')
    const fallbacks = fallbackVariations(rows.map((r) => r.fileName))
    const kept = rows.filter((r) => !filling.includes(r) && r.variation).map((r) => r.variation!.words)
    const words = numberRepeats(kept, filling.map((r) => fallbacks[rows.indexOf(r)]!.words))

    const changed = new Set<number>()
    this.repo.transaction(() => {
      filling.forEach((r, i) => {
        const next = { words: words[i]!, source: fallbacks[rows.indexOf(r)]!.source }
        if (r.variation?.words === next.words && r.variation.source === next.source) return
        this.writeVariation(pile, r, next)
        changed.add(r.id)
      })
      for (const r of rows) {
        if (r.title === base) continue
        this.writeTitle(pile, r, base, false)
        changed.add(r.id)
      }
      this.reindex(pile, [...changed])
    })
    return [...changed]
  }

  /**
   * Rename a pile: its base, on every mockup in it, exactly. A person's base is kept from a late AI
   * suggestion; the AI's (`by: 'ai'`, the top's suggestion landing) is not.
   */
  renameBase(pileId: number, base: string, by: 'person' | 'ai' = 'person'): RenameResult {
    const words = tidyWords(base)
    if (!words) throw new Error('A pile needs a name')
    const pile = this.rowsOf(pileId)
    if (!pile) throw new Error(`Mockup ${pileId} is not a pile`)
    const previous = pile.rows[0]!.title
    const mockupIds: number[] = []
    this.repo.transaction(() => {
      for (const r of pile.rows) {
        if (r.title === words) continue
        this.writeTitle(pile, r, words, by === 'person')
        mockupIds.push(r.id)
      }
      this.reindex(pile, mockupIds)
    })
    return { pileId, base: words, previous, mockupIds }
  }

  /**
   * Set one mockup's variation. Words a person types are kept exactly, even when another mockup has
   * them. Emptied, it takes its file marker or number back. `source` is for Undo: it puts back
   * exactly what `previous` held.
   */
  setVariation(mockupId: number, words: string, source?: VariationSource): VariationResult {
    const m = this.repo.mockups.getMockup(mockupId)
    const pileId = m ? (m.isGroup ? m.id : m.groupId) : null
    const pile = pileId !== null ? this.rowsOf(pileId) : null
    const row = pile?.rows.find((r) => r.id === mockupId)
    if (!pile || !row) throw new Error(`Mockup ${mockupId} is not in a pile`)

    const previous = row.variation
    const tidy = tidyWords(words)
    let next: Variation
    if (!tidy) {
      const fallback = fallbackVariations(pile.rows.map((r) => r.fileName))[pile.rows.indexOf(row)]!
      const others = pile.rows.filter((r) => r !== row && r.variation).map((r) => r.variation!.words)
      next = { words: numberRepeats(others, [fallback.words])[0]!, source: fallback.source }
    } else if (source) {
      next = { words: tidy, source }
    } else if (previous && previous.words === tidy) {
      next = previous
    } else {
      next = { words: tidy, source: 'typed' }
    }
    if (next !== previous) {
      this.repo.transaction(() => {
        this.writeVariation(pile, row, next)
        this.reindex(pile, [row.id])
      })
    }
    return { mockupId, variation: next, previous }
  }

  /**
   * The AI's words for a pile (the 4B and 9B write them in one request). Each answer lands on its
   * mockup unless the person typed there; "same" or no answer takes the fallback; words another
   * mockup already has get a number. Returns the mockups it changed.
   */
  landAi(pileId: number, answers: ReadonlyMap<number, string | null>): number[] {
    const pile = this.rowsOf(pileId)
    if (!pile) return []
    const { rows } = pile
    const landing = rows.filter((r) => answers.has(r.id) && r.variation?.source !== 'typed')
    const fallbacks = fallbackVariations(rows.map((r) => r.fileName))
    const offered = landing.map((r): Variation => {
      const said = answers.get(r.id)
      return said == null || saysSame(said) ? fallbacks[rows.indexOf(r)]! : { words: tidyWords(said), source: 'ai' }
    })
    const kept = rows.filter((r) => !landing.includes(r) && r.variation).map((r) => r.variation!.words)
    const words = numberRepeats(kept, offered.map((v) => v.words))
    const changed: number[] = []
    this.repo.transaction(() => {
      landing.forEach((r, i) => {
        const next = { words: words[i]!, source: offered[i]!.source }
        if (r.variation?.words === next.words && r.variation.source === next.source) return
        this.writeVariation(pile, r, next)
        changed.push(r.id)
      })
      this.reindex(pile, changed)
    })
    return changed
  }

  /** Mockups now on their own: each keeps its full title (`base · variation`) as its own. */
  leave(ids: number[]): void {
    this.repo.transaction(() => {
      for (const id of ids) {
        const m = this.repo.mockups.getMockup(id)
        if (!m?.variation) continue
        this.repo.mockups.updateMockup(id, { title: fullTitle(m.title, { words: m.variation }), variation: null, variationSource: null })
        this.reindexMockups([id])
      }
    })
  }

  /**
   * At launch: every pile made whole (`fill`), which gives piles from before base titles their base
   * (the top's title) and variations (the fallback), and every mockup on its own without a variation.
   * Changes nothing when everything already is.
   */
  settleAll(): void {
    for (const id of this.repo.piles.getPileTopIds()) this.fill(id)
    this.leave(this.repo.piles.getLoneIdsWithVariation())
  }

  /**
   * The name a pile waiting in To stash goes by until the AI writes its base: what the Sort board
   * called it (design/specs/pile-titles.md, the rule chain), as a title. A shared start of names
   * loses its separators and ellipsis, and the top's file name its extension.
   */
  provisionalBase(pileId: number): string {
    const top = this.repo.mockups.getMockup(pileId)
    if (!top) return ''
    const members = [top, ...this.repo.piles.getMockupsByGroupId(pileId).sort((a, b) => a.id - b.id)]
    const { title } = pileTitle(
      members.map((m) => {
        const ctx = m.importContext as { folderTrail?: string[]; archiveTitle?: string } | null
        return {
          fileName: fileNameOf(m),
          folderTrail: ctx?.folderTrail ?? [],
          isPrimary: m.id === top.id,
          ...(ctx?.archiveTitle && { archiveTitle: ctx.archiveTitle })
        }
      })
    )
    return asTitle(title) || top.title
  }

  // ---- where the titles live ----

  /**
   * A pile's rows in pile order, or null when `pileId` is no pile's top. Waiting in To stash, only
   * the mockups that have drafts, and none at all until the top has one.
   */
  private rowsOf(pileId: number): PileRows | null {
    const top = this.repo.mockups.getMockup(pileId)
    if (!top?.isGroup) return null
    const members = [top, ...this.repo.piles.getMockupsByGroupId(pileId).sort((a, b) => a.id - b.id)]
    if (top.stage === 'stashed') {
      const rows = members
        .filter((m) => m.stage === 'stashed')
        .map((m) => ({ id: m.id, fileName: fileNameOf(m), title: m.title, variation: variationOf(m), draft: null }))
      return { pileId, inDrafts: false, rows }
    }
    const drafts = this.repo.drafts.getDrafts(members.map((m) => m.id))
    if (!drafts.has(top.id)) return null
    const rows = members.flatMap((m) => {
      const d = drafts.get(m.id)
      return d && m.deletedAt === null ? [{ id: m.id, fileName: fileNameOf(m), title: d.title, variation: variationOf(d), draft: d }] : []
    })
    return { pileId, inDrafts: true, rows }
  }

  private writeTitle(pile: PileRows, row: TitleRow, title: string, keep: boolean): void {
    if (pile.inDrafts) {
      const kept = row.draft!.keptFields
      this.repo.drafts.updateDraft(row.id, { title, ...(keep && !kept.includes('title') && { keptFields: [...kept, 'title'] }) })
    } else {
      this.repo.mockups.updateMockup(row.id, { title })
    }
    row.title = title
  }

  private writeVariation(pile: PileRows, row: TitleRow, v: Variation): void {
    const patch = { variation: v.words, variationSource: v.source }
    if (pile.inDrafts) this.repo.drafts.updateDraft(row.id, patch)
    else this.repo.mockups.updateMockup(row.id, patch)
    row.variation = v
  }

  /** Stashed mockups are searched by their full title: index again the ones that changed. */
  private reindex(pile: PileRows, ids: number[]): void {
    if (!pile.inDrafts) this.reindexMockups(ids)
  }

  private reindexMockups(ids: number[]): void {
    for (const id of ids) {
      const m = this.repo.mockups.getMockup(id)
      if (m && m.stage === 'stashed' && m.deletedAt === null) this.repo.search.upsertSearchIndex(id)
    }
  }
}
