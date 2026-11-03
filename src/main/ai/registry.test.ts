import { describe, it, expect } from 'vitest'
import { promptProfile } from './prompts'
import {
  availableModels,
  bestFitModelId,
  getModel,
  isBuiltIn,
  MODEL_REGISTRY,
  modelsForTier
} from './registry'

const mac = (totalMemoryGB: number) => ({ chip: 'Apple M2', totalMemoryGB, isAppleSilicon: true })

describe('catalogue', () => {
  it('is Qwen3-VL 4B, Qwen3.5 9B and Apple’s built-in model, in that order', () => {
    expect(availableModels().map((m) => [m.id, m.tier, m.runtime])).toEqual([
      ['qwen3-vl-4b', 'medium', 'llama'],
      ['qwen3.5-9b', 'large', 'llama'],
      ['apple', 'small', 'apple']
    ])
  })

  it('no longer has Qwen 2.5 VL 3B and 7B, or the models before them', () => {
    for (const id of ['qwen2.5-vl-3b', 'qwen2.5-vl-7b', 'smolvlm2-2.2b', 'moondream2']) {
      expect(getModel(id)).toBeUndefined()
    }
  })

  it('names a prompt profile for every model, the profile of the same id', () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.prompt).toBe(m.id)
      expect(promptProfile(m.prompt)).toBeDefined()
    }
  })

  it('has two files per downloaded model and a size that is both added together', () => {
    for (const m of MODEL_REGISTRY.filter((e) => !isBuiltIn(e))) {
      expect(m.files!.model.url).toMatch(/^https:\/\/huggingface\.co\/.+\.gguf$/)
      expect(m.files!.mmproj.url).toMatch(/mmproj.*\.gguf$/)
      expect(m.sizeBytes).toBe(m.files!.model.sizeBytes + m.files!.mmproj.sizeBytes)
    }
  })

  it('uses the exact files, byte sizes and sha256 values in design/research/vlm-models.md', () => {
    expect(getModel('qwen3-vl-4b')!.files).toEqual({
      model: {
        url: 'https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf',
        sizeBytes: 2_497_281_664,
        sha256: '66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a'
      },
      mmproj: {
        url: 'https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf',
        sizeBytes: 453_974_304,
        sha256: '30ba2c7dd3127a4561b6cba9d13d0f711c91bdb38742e2f56d73c8cb596bd06d'
      }
    })
    expect(getModel('qwen3.5-9b')!.files).toEqual({
      model: {
        url: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf',
        sizeBytes: 5_680_522_464,
        sha256: '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8'
      },
      mmproj: {
        url: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/mmproj-F16.gguf',
        sizeBytes: 918_166_080,
        sha256: 'f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f'
      }
    })
  })

  it('has nothing to download for Apple’s model', () => {
    const apple = getModel('apple')!
    expect(isBuiltIn(apple)).toBe(true)
    expect(apple.files).toBeNull()
    expect(apple.sizeBytes).toBe(0)
  })

  it('rates the models from the bake-off: 4B quality 4 speed 4, 9B 5 and 3, Apple 3 and 5', () => {
    expect(getModel('qwen3-vl-4b')).toMatchObject({ quality: 4, speed: 4, minMemoryGB: 8 })
    expect(getModel('qwen3.5-9b')).toMatchObject({ quality: 5, speed: 3, minMemoryGB: 16 })
    expect(getModel('apple')).toMatchObject({ quality: 3, speed: 5, minMemoryGB: 8 })
  })

  it('has no em dashes in what the user reads', () => {
    for (const m of MODEL_REGISTRY) expect(`${m.name}${m.description}`).not.toContain('—')
  })

  it('finds models by tier', () => {
    expect(modelsForTier('medium').map((m) => m.id)).toEqual(['qwen3-vl-4b'])
    expect(modelsForTier('large').map((m) => m.id)).toEqual(['qwen3.5-9b'])
  })
})

describe('Best fit', () => {
  it.each([8, 16, 24, 32, 64, 128])('is Qwen3-VL 4B on %s GB', (gbMemory) => {
    expect(bestFitModelId(mac(gbMemory))).toBe('qwen3-vl-4b')
  })
})
