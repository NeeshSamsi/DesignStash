/**
 * M4.7 CI guard — structural checks that enforce spec §9/§6.2:
 * "no real model or network calls in tests/CI".
 *
 * Rules:
 * 1. MockInferenceProvider is the default provider for tests.
 * 2. node-llama-cpp IS installed, but its native binary must never load at test time
 *    (LocalInferenceProvider uses dynamic import + injected promptFn).
 * 3. OllamaInferenceProvider (ollama-provider.ts) must not exist — we use local GGUF, not Ollama.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
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
  it('node-llama-cpp package.json is present (expected dependency)', () => {
    const llamaCppPkg = join(
      import.meta.dirname ?? __dirname,
      '../../../node_modules/node-llama-cpp/package.json'
    )
    expect(existsSync(llamaCppPkg)).toBe(true)
  })

  it('LocalInferenceProvider exists and is importable without loading the native binary', async () => {
    // Dynamic import must not throw — the native binary is guarded behind loadLlamaFn()
    const { LocalInferenceProvider } = await import('./local-provider')
    const provider = new LocalInferenceProvider('/models/test.gguf', async () => '{}')
    expect(provider.id).toBe('local')
  })

  it('OllamaInferenceProvider does not exist — we use local GGUF, not Ollama', () => {
    const ollamaProvider = join(
      import.meta.dirname ?? __dirname,
      'ollama-provider.ts'
    )
    expect(existsSync(ollamaProvider)).toBe(false)
  })
})
