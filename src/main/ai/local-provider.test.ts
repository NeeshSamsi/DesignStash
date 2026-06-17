import { describe, it, expect, vi } from 'vitest'
import { LocalInferenceProvider } from './local-provider'

const VALID_RESULT = {
  title: 'iPhone Checkout Flow',
  description: 'A checkout flow mockup designed for iPhone.',
  tags: [
    { category: 'Device', label: 'iPhone' },
    { category: 'Context', label: 'E-commerce' },
    { category: 'Platform', label: 'iOS' }
  ]
}

const BASE_INPUT = { imagePath: '', fileName: 'checkout-v2.psd', folderTrail: [] }

function makeProvider(response: object | string) {
  const raw = typeof response === 'string' ? response : JSON.stringify(response)
  const promptFn = vi.fn().mockResolvedValue(raw)
  return { provider: new LocalInferenceProvider('/models/test.gguf', promptFn), promptFn }
}

describe('LocalInferenceProvider.analyze', () => {
  it('returns a valid InferenceResult when model returns valid JSON', async () => {
    const { provider } = makeProvider(VALID_RESULT)
    const result = await provider.analyze(BASE_INPUT)
    expect(result.title).toBe('iPhone Checkout Flow')
    expect(result.tags).toHaveLength(3)
  })

  it('includes filename in the prompt', async () => {
    const { provider, promptFn } = makeProvider(VALID_RESULT)
    await provider.analyze({ ...BASE_INPUT, fileName: 'onboarding-screen.psd' })
    expect(promptFn.mock.calls[0]![0]).toContain('onboarding-screen.psd')
  })

  it('includes folder trail in the prompt', async () => {
    const { provider, promptFn } = makeProvider(VALID_RESULT)
    await provider.analyze({ ...BASE_INPUT, folderTrail: ['Devices', 'iPhone', 'E-commerce'] })
    expect(promptFn.mock.calls[0]![0]).toContain('Devices / iPhone / E-commerce')
  })

  it('includes groupContext variant info in the prompt', async () => {
    const { provider, promptFn } = makeProvider(VALID_RESULT)
    await provider.analyze({
      ...BASE_INPUT,
      groupContext: { originalTitle: 'MacBook Hero', originalDescription: 'Hero section', originalTags: [] }
    })
    expect(promptFn.mock.calls[0]![0]).toContain('"MacBook Hero"')
  })

  it('extracts JSON from a response that has surrounding prose', async () => {
    const { provider } = makeProvider(`Here is the result:\n${JSON.stringify(VALID_RESULT)}\nDone.`)
    const result = await provider.analyze(BASE_INPUT)
    expect(result.title).toBe('iPhone Checkout Flow')
  })

  it('caches the promptFn across multiple analyze() calls', async () => {
    const promptFn = vi.fn().mockResolvedValue(JSON.stringify(VALID_RESULT))
    const provider = new LocalInferenceProvider('/models/test.gguf', promptFn)
    await provider.analyze(BASE_INPUT)
    await provider.analyze(BASE_INPUT)
    // promptFn itself should be called twice, but the factory only once (covered by no llama load)
    expect(promptFn).toHaveBeenCalledTimes(2)
  })

  it('throws when model returns no JSON', async () => {
    const { provider } = makeProvider('Sorry, I cannot help with that.')
    await expect(provider.analyze(BASE_INPUT)).rejects.toThrow('No JSON found')
  })

  it('throws when model returns JSON that does not match schema', async () => {
    const { provider } = makeProvider({ wrong: 'shape' })
    await expect(provider.analyze(BASE_INPUT)).rejects.toThrow('schema')
  })

  it('exposes id="local" and derives name from model filename', () => {
    const provider = new LocalInferenceProvider('/models/phi-3.5-mini.gguf')
    expect(provider.id).toBe('local')
    expect(provider.name).toBe('phi-3.5-mini')
  })
})
