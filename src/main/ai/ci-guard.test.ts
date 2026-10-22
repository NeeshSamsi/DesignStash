/**
 * M4.7 CI guard — structural checks that enforce spec §9/§6.2:
 * "no real model or network calls in tests/CI".
 *
 * Rules:
 * 1. MockInferenceProvider is the default provider for tests.
 * 2. The vision provider never starts a real llama-server or loads a model at test time: it takes
 *    its server through an injected seam (see provider-factory.ts).
 * 3. OllamaInferenceProvider (ollama-provider.ts) must not exist — we use local GGUF, not Ollama.
 * 4. The old text runtime (node-llama-cpp and local-provider.ts) is gone.
 */
import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MockInferenceProvider } from '../../../src/shared/mock-inference'
import type { InferenceProvider } from '../../../src/shared/inference'

describe('CI guard — MockInferenceProvider is the test default', () => {
  it('MockInferenceProvider satisfies the InferenceProvider interface', () => {
    const provider: InferenceProvider = new MockInferenceProvider()
    expect(provider.id).toBe('mock-provider')
    expect(typeof provider.analyze).toBe('function')
  })

  it('MockInferenceProvider.analyze returns a valid InferenceResult', async () => {
    const provider = new MockInferenceProvider()
    const result = await provider.analyze({
      imagePath: '/tmp/cover.png',
      fileName: 'hero.psd',
      folderTrail: ['Devices', 'Laptop']
    })
    expect(result.title).toBeTruthy()
    expect(result.description).toBeTruthy()
    expect(Array.isArray(result.tags)).toBe(true)
    expect(result.tags.every((t) => t.category && t.label)).toBe(true)
  })
})

describe('CI guard — runtime boundaries', () => {
  it('the vision provider factory builds nothing until asked, so no server starts at import time', async () => {
    const { createProviderFactory } = await import('./provider-factory')
    const createVision = vi.fn()
    createProviderFactory({
      modelsDir: '/models',
      llamaServerPath: () => '/bin/llama-server',
      exists: () => true,
      createVision
    })
    expect(createVision).not.toHaveBeenCalled()
  })

  it('without a llama-server binary there is no provider, and nothing is started', async () => {
    const { createProviderFactory } = await import('./provider-factory')
    const createVision = vi.fn()
    const factory = createProviderFactory({
      modelsDir: '/models',
      llamaServerPath: () => null,
      exists: () => true,
      createVision
    })
    expect(await factory.forModel('qwen3-vl-4b')).toBeNull()
    expect(createVision).not.toHaveBeenCalled()
  })

  it('OllamaInferenceProvider does not exist — we use local GGUF, not Ollama', () => {
    const ollamaProvider = join(
      import.meta.dirname ?? __dirname,
      'ollama-provider.ts'
    )
    expect(existsSync(ollamaProvider)).toBe(false)
  })

  it('the old text runtime is gone: no local-provider.ts and no node-llama-cpp dependency', () => {
    const root = join(import.meta.dirname ?? __dirname, '../../..')
    expect(existsSync(join(root, 'src/main/ai/local-provider.ts'))).toBe(false)
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(pkg.dependencies?.['node-llama-cpp']).toBeUndefined()
  })
})
