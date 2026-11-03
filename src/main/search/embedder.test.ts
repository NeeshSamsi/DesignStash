import { describe, it, expect, vi } from 'vitest'
import { LlamaMeaningEmbedder } from './embedder'

const server = (vectors: number[][]) => ({
  embed: vi.fn(async () => vectors),
  stop: vi.fn(async () => {})
})

describe('LlamaMeaningEmbedder', () => {
  it('puts search_document: in front of each document and returns unit vectors', async () => {
    const s = server([[3, 4], [0, 2]])
    const out = await new LlamaMeaningEmbedder(s).embedDocuments(['Tote bag', 'Mug'])
    expect(s.embed).toHaveBeenCalledWith(['search_document: Tote bag', 'search_document: Mug'])
    expect([...out[0]!]).toEqual([0.6000000238418579, 0.800000011920929])
    expect([...out[1]!]).toEqual([0, 1])
  })

  it('puts search_query: in front of a query', async () => {
    const s = server([[1, 0]])
    const v = await new LlamaMeaningEmbedder(s).embedQuery('jumper')
    expect(s.embed).toHaveBeenCalledWith(['search_query: jumper'])
    expect([...v]).toEqual([1, 0])
  })

  it('sends nothing for no documents', async () => {
    const s = server([])
    expect(await new LlamaMeaningEmbedder(s).embedDocuments([])).toEqual([])
    expect(s.embed).not.toHaveBeenCalled()
  })

  it('passes a server failure on', async () => {
    const s = { embed: vi.fn().mockRejectedValue(new Error('down')), stop: vi.fn() }
    await expect(new LlamaMeaningEmbedder(s).embedQuery('x')).rejects.toThrow('down')
  })
})
