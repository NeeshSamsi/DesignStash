import { describe, it, expect } from 'vitest'
import { availableModels, bestFitModelId, getModel, MODEL_REGISTRY, modelsForTier } from './registry'

const mac = (totalMemoryGB: number) => ({ chip: 'Apple M2', totalMemoryGB, isAppleSilicon: true })

describe('catalogue', () => {
  it('offers SmolVLM2, Qwen 3B and Qwen 7B, in tier order, and hides Moondream 2', () => {
    expect(availableModels().map((m) => [m.id, m.tier])).toEqual([
      ['smolvlm2-2.2b', 'small'],
      ['qwen2.5-vl-3b', 'medium'],
      ['qwen2.5-vl-7b', 'large']
    ])
  })

  it('keeps Moondream 2 behind a flag marked pending, shown only when asked for', () => {
    expect(getModel('moondream2')?.pending).toBe('wp4.1-confirmation')
    expect(availableModels({ includePending: true }).map((m) => m.id)).toContain('moondream2')
    expect(modelsForTier('small').map((m) => m.id)).toEqual(['smolvlm2-2.2b'])
  })

  it('has two files per model and a size that is both added together', () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.files.model.url).toMatch(/^https:\/\/huggingface\.co\/.+\.gguf$/)
      expect(m.files.mmproj.url).toMatch(/mmproj.*\.gguf$/)
      expect(m.files.model.sizeBytes).toBeGreaterThan(0)
      expect(m.sizeBytes).toBe(m.files.model.sizeBytes + m.files.mmproj.sizeBytes)
    }
  })

  it('has valid ids, bars and sha256 values', () => {
    const ids = MODEL_REGISTRY.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of MODEL_REGISTRY) {
      for (const bars of [m.quality, m.speed]) {
        expect(Number.isInteger(bars) && bars >= 1 && bars <= 5).toBe(true)
      }
      expect(m.languages.length).toBeGreaterThan(0)
      for (const f of [m.files.model, m.files.mmproj]) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('sizes match the Hugging Face listings (SmolVLM2 about 1.7 GB, Qwen 3B 2.8 GB, Qwen 7B 5.5 GB)', () => {
    const gb = (id: string) => getModel(id)!.sizeBytes / 1e9
    expect(gb('smolvlm2-2.2b')).toBeCloseTo(1.7, 1)
    expect(gb('qwen2.5-vl-3b')).toBeCloseTo(2.77, 1)
    expect(gb('qwen2.5-vl-7b')).toBeCloseTo(5.54, 1)
  })

  it('has no em dashes in what the user reads', () => {
    for (const m of MODEL_REGISTRY) expect(`${m.name}${m.description}`).not.toContain('—')
  })
})

describe('Best fit', () => {
  it.each([
    [8, 'smolvlm2-2.2b'],
    [15.9, 'smolvlm2-2.2b'],
    [16, 'qwen2.5-vl-3b'],
    [24, 'qwen2.5-vl-3b'],
    [31.9, 'qwen2.5-vl-3b'],
    [32, 'qwen2.5-vl-7b'],
    [64, 'qwen2.5-vl-7b']
  ])('picks the right model on %s GB', (gbMemory, id) => {
    expect(bestFitModelId(mac(gbMemory))).toBe(id)
  })

  it('is Qwen 2.5 VL 3B on 16 and 32 GB Macs, which is the default', () => {
    expect(bestFitModelId(mac(16))).toBe('qwen2.5-vl-3b')
    expect(bestFitModelId(mac(24))).toBe('qwen2.5-vl-3b')
  })
})
