import { describe, it, expect } from 'vitest'
import { availableModels, bestFitModelId, getModel, MODEL_REGISTRY, modelsForTier } from './registry'

const mac = (totalMemoryGB: number) => ({ chip: 'Apple M2', totalMemoryGB, isAppleSilicon: true })

describe('catalogue', () => {
  it('is Qwen 2.5 VL 3B and 7B only, with SmolVLM2 and Moondream 2 gone', () => {
    expect(availableModels().map((m) => [m.id, m.tier])).toEqual([
      ['qwen2.5-vl-3b', 'medium'],
      ['qwen2.5-vl-7b', 'large']
    ])
    expect(getModel('smolvlm2-2.2b')).toBeUndefined()
    expect(getModel('moondream2')).toBeUndefined()
    expect(modelsForTier('small')).toEqual([])
  })

  it('has two files per model and a size that is both added together', () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.files.model.url).toMatch(/^https:\/\/huggingface\.co\/ggml-org\/.+\.gguf$/)
      expect(m.files.mmproj.url).toMatch(/mmproj.*\.gguf$/)
      expect(m.sizeBytes).toBe(m.files.model.sizeBytes + m.files.mmproj.sizeBytes)
    }
  })

  it('uses the exact files, byte sizes and sha256 values recorded in design/specs/ai.md', () => {
    const three = getModel('qwen2.5-vl-3b')!.files
    expect(three.model).toEqual({
      url: 'https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf',
      sizeBytes: 1_929_901_056,
      sha256: 'd02fe9b69ad8cadbbd228e387667af66612c44bed29ffc8eb1e7caf9ac486c12'
    })
    expect(three.mmproj).toEqual({
      url: 'https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf',
      sizeBytes: 844_757_728,
      sha256: '980c9b2f78c04e6cff93d277ada09e768394f112d75db3b4e9dea8a69f9fb904'
    })
    const seven = getModel('qwen2.5-vl-7b')!.files
    expect(seven.model).toEqual({
      url: 'https://huggingface.co/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf',
      sizeBytes: 4_683_072_032,
      sha256: '9258bf05b12686d097ff3b6b18d968ab393649780aa2b3cd67fec43d50554392'
    })
    expect(seven.mmproj).toEqual({
      url: 'https://huggingface.co/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf',
      sizeBytes: 853_119_712,
      sha256: '2ddb555391bae966e412deab9e07b58afa18bcc06930ba0f1c78a3695ab9e506'
    })
  })

  it('rates 3B as quality 4 and speed 4, and 7B as quality 5 and speed 3', () => {
    expect(getModel('qwen2.5-vl-3b')).toMatchObject({ quality: 4, speed: 4 })
    expect(getModel('qwen2.5-vl-7b')).toMatchObject({ quality: 5, speed: 3 })
  })

  it('needs 8 GB for 3B (about 3.5 GB in use) and 16 GB for 7B (about 6.3 GB in use)', () => {
    expect(getModel('qwen2.5-vl-3b')?.minMemoryGB).toBe(8)
    expect(getModel('qwen2.5-vl-7b')?.minMemoryGB).toBe(16)
  })

  it('has no em dashes in what the user reads', () => {
    for (const m of MODEL_REGISTRY) expect(`${m.name}${m.description}`).not.toContain('\u2014')
  })
})

describe('Best fit', () => {
  it.each([
    [8, 'qwen2.5-vl-3b'],
    [16, 'qwen2.5-vl-3b'],
    [24, 'qwen2.5-vl-3b'],
    [31.9, 'qwen2.5-vl-3b'],
    [32, 'qwen2.5-vl-7b'],
    [64, 'qwen2.5-vl-7b']
  ])('is the right model on %s GB', (gbMemory, id) => {
    expect(bestFitModelId(mac(gbMemory))).toBe(id)
  })
})
