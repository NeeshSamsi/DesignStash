import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { ensureSearchIndex } from '../db/search-index'
import { createTestDb, sample } from '../db/repositories/__tests__/setup'
import type { Repository } from '../db/repository'
import { EmbeddingService } from './embedding-service'
import type { MeaningEmbedder } from './embedder'
import { MEANING_MODEL_ID, documentHash, normalise } from './meaning'

let sqlite: Database.Database
let repo: Repository

beforeEach(() => {
  const t = createTestDb()
  ;({ sqlite, repo } = t)
  ensureSearchIndex(t.db)
})
afterEach(() => sqlite.close())

/** Vectors by a keyword in the text: "sweatshirt" is [1,0], "bag" is [0,1], anything else [0.7,0.7]. */
function fakeEmbedder(): MeaningEmbedder & { documentBatches: string[][] } {
  const vec = (t: string) =>
    Float32Array.from(
      normalise(t.includes('sweatshirt') ? [1, 0] : t.includes('bag') ? [0, 1] : [0.7, 0.7])
    )
  const batches: string[][] = []
  return {
    documentBatches: batches,
    embedDocuments: async (texts) => {
      batches.push([...texts])
      return texts.map(vec)
    },
    embedQuery: async (q) => (q === 'jumper' ? Float32Array.from([1, 0]) : vec(q)),
    stop: async () => {}
  }
}

const stashed = (title: string, path: string, description?: string) => {
  const m = repo.mockups.createMockup({ ...sample, title, libraryPath: path, stage: 'stashed' })
  if (description) repo.mockups.updateMockup(m.id, { description })
  repo.search.upsertSearchIndex(m.id)
  return m
}

function service(overrides: Partial<ConstructorParameters<typeof EmbeddingService>[0]> = {}) {
  const embedder = fakeEmbedder()
  const svc = new EmbeddingService({
    repo,
    available: () => true,
    embedder: () => embedder,
    sleep: async () => {},
    ...overrides
  })
  return { svc, embedder }
}

describe('EmbeddingService', () => {
  it('embeds a mockup when it is indexed and stores the vector with its hash', async () => {
    const { svc, embedder } = service()
    const m = stashed('Black sweatshirt', '/lib/s/a.psd')
    svc.documentChanged(m.id, 'Black sweatshirt')
    await svc.idle()
    expect(embedder.documentBatches).toEqual([['Black sweatshirt']])
    expect(repo.embeddings.hashOf(m.id, MEANING_MODEL_ID)).toBe(documentHash('Black sweatshirt'))
  })

  it('re-embeds only when the text hash changes', async () => {
    const { svc, embedder } = service()
    const m = stashed('Tote bag', '/lib/s/b.psd')
    svc.documentChanged(m.id, 'Tote bag')
    await svc.idle()
    svc.documentChanged(m.id, 'Tote bag')
    await svc.idle()
    expect(embedder.documentBatches).toHaveLength(1)
    svc.documentChanged(m.id, 'Tote bag. Canvas')
    await svc.idle()
    expect(embedder.documentBatches).toHaveLength(2)
  })

  it('backfill queues only the mockups without a current vector, in id order, and is idempotent', async () => {
    const a = stashed('Alpha bag', '/lib/s/c.psd')
    const b = stashed('Beta bag', '/lib/s/d.psd')
    const { svc, embedder } = service()
    repo.embeddings.upsert(a.id, MEANING_MODEL_ID, [1, 0], documentHash('Alpha bag'))
    svc.backfill()
    await svc.idle()
    expect(embedder.documentBatches).toEqual([['Beta bag']])
    expect(repo.embeddings.hashOf(b.id, MEANING_MODEL_ID)).toBe(documentHash('Beta bag'))
    svc.backfill()
    await svc.idle()
    expect(embedder.documentBatches).toHaveLength(1)
  })

  it('backfill returns quietly once the service is stopped or the database is closed', async () => {
    stashed('Tote bag', '/lib/s/q.psd')
    const { svc, embedder } = service()
    sqlite.close()
    expect(() => svc.backfill()).not.toThrow()
    await svc.idle()
    await svc.stop()
    expect(() => svc.backfill()).not.toThrow()
    expect(embedder.documentBatches).toEqual([])
  })

  it('works in batches of 8 and waits while AI suggestions are running', async () => {
    let busyChecks = 0
    const { svc, embedder } = service({ isBusy: () => ++busyChecks <= 2 })
    for (let i = 0; i < 10; i++) stashed(`Bag ${i}`, `/lib/s/e${i}.psd`)
    svc.backfill()
    await svc.idle()
    expect(embedder.documentBatches.map((b) => b.length)).toEqual([8, 2])
    expect(busyChecks).toBeGreaterThan(2)
  })

  it('does nothing when the model is not available', async () => {
    const { svc, embedder } = service({ available: () => false })
    const m = stashed('Tote bag', '/lib/s/f.psd')
    svc.documentChanged(m.id, 'Tote bag')
    svc.backfill()
    await svc.idle()
    expect(embedder.documentBatches).toEqual([])
    expect(await svc.similarities('bag')).toBeNull()
  })

  it('skips a mockup that left the index before its turn', async () => {
    const { svc, embedder } = service()
    const m = stashed('Tote bag', '/lib/s/g.psd')
    svc.documentChanged(m.id, 'Tote bag')
    repo.search.removeSearchIndex(m.id)
    await svc.idle()
    expect(embedder.documentBatches).toEqual([])
    expect(repo.embeddings.count(MEANING_MODEL_ID)).toBe(0)
  })

  it('puts a failed batch at the back after a pause, and the next batch still runs, so one failure loses nothing (F-027)', async () => {
    const embedder = fakeEmbedder()
    const tries = vi.spyOn(embedder, 'embedDocuments').mockRejectedValueOnce(new Error('down'))
    const sleeps: number[] = []
    const log = vi.fn()
    const svc = new EmbeddingService({
      repo,
      available: () => true,
      embedder: () => embedder,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      log
    })
    for (let i = 0; i < 10; i++) stashed(`Bag ${i}`, `/lib/s/r${i}.psd`)
    svc.backfill()
    await svc.idle()

    expect(repo.embeddings.count(MEANING_MODEL_ID)).toBe(10)
    expect(tries).toHaveBeenCalledTimes(3)
    // The 2 that were behind it lead the next batch, and the failed 8 follow.
    expect(embedder.documentBatches.map((b) => b.length)).toEqual([8, 2])
    expect(embedder.documentBatches[0]!.slice(0, 2)).toEqual([expect.stringMatching(/^Bag 8/), expect.stringMatching(/^Bag 9/)])
    expect(sleeps).toContain(30_000)
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/again in 30 s/), expect.any(Error))
  })

  it('tries a mockup three times, waiting longer each time, then leaves it to the next backfill (F-027)', async () => {
    const embedder = fakeEmbedder()
    const tries = vi.spyOn(embedder, 'embedDocuments').mockRejectedValue(new Error('down'))
    const sleeps: number[] = []
    const svc = new EmbeddingService({
      repo,
      available: () => true,
      embedder: () => embedder,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      log: () => {}
    })
    stashed('Tote bag', '/lib/s/h.psd')
    svc.backfill()
    await svc.idle()
    expect(tries).toHaveBeenCalledTimes(3)
    expect(sleeps.filter((ms) => ms >= 30_000)).toEqual([30_000, 120_000])
    expect(repo.embeddings.count(MEANING_MODEL_ID)).toBe(0)

    tries.mockRestore()
    svc.backfill()
    await svc.idle()
    expect(repo.embeddings.count(MEANING_MODEL_ID)).toBe(1)
  })

  it('scores every stored mockup against a query: "jumper" is closest to the sweatshirt', async () => {
    const { svc } = service()
    const sweat = stashed('Black sweatshirt', '/lib/s/i.psd')
    const bag = stashed('Tote bag', '/lib/s/j.psd')
    svc.backfill()
    await svc.idle()
    const sims = (await svc.similarities('jumper'))!
    expect(sims.get(sweat.id)).toBeCloseTo(1)
    expect(sims.get(bag.id)).toBeCloseTo(0)
  })

  it('answers null for a query when the embedder fails', async () => {
    const embedder = fakeEmbedder()
    embedder.embedQuery = async () => {
      throw new Error('down')
    }
    const svc = new EmbeddingService({
      repo,
      available: () => true,
      embedder: () => embedder,
      log: () => {}
    })
    const m = stashed('Tote bag', '/lib/s/k.psd')
    repo.embeddings.upsert(m.id, MEANING_MODEL_ID, [1, 0], 'h')
    expect(await svc.similarities('bag')).toBeNull()
  })
})
