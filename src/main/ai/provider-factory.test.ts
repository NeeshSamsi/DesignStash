import { describe, it, expect, vi, afterEach } from 'vitest'
import { join } from 'node:path'
import { InferenceResultSchema, type InferenceProvider } from '../../shared/inference'
import { AppleInferenceProvider } from './apple-provider'
import { PROMPT_PROFILES } from './prompts'
import {
  MODEL_SERVER_ARGS,
  createProviderFactory,
  resolveLlamaServerPath,
  serverArgsFor,
  type ProviderFactoryOptions,
  type VisionModelFiles
} from './provider-factory'

const MODELS = '/models'

function stubProvider(id: string) {
  const dispose = vi.fn(async () => {})
  const provider: InferenceProvider & { dispose(): Promise<void> } = {
    id,
    name: id,
    analyze: vi.fn(),
    dispose
  }
  return provider
}

function setup(files: string[], opts: Partial<ProviderFactoryOptions> = {}) {
  const present = new Set(files.map((f) => join(MODELS, f)))
  const createVision = vi.fn<(files: VisionModelFiles) => ReturnType<typeof stubProvider>>(() =>
    stubProvider('vision')
  )
  const factory = createProviderFactory({
    modelsDir: MODELS,
    llamaServerPath: () => '/bin/llama-server',
    exists: (p) => present.has(p),
    createVision,
    ...opts
  })
  return { factory, createVision }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createProviderFactory', () => {
  it('runs Qwen3-VL 4B on llama-server with its own prompt and the prompt cache off', async () => {
    const { factory, createVision } = setup(['qwen3-vl-4b/model.gguf', 'qwen3-vl-4b/mmproj.gguf'])
    const provider = await factory.forModel('qwen3-vl-4b')
    expect(provider?.id).toBe('vision')
    expect(createVision).toHaveBeenCalledWith({
      name: 'Qwen3-VL 4B',
      modelPath: '/models/qwen3-vl-4b/model.gguf',
      mmprojPath: '/models/qwen3-vl-4b/mmproj.gguf',
      binaryPath: '/bin/llama-server',
      prompt: PROMPT_PROFILES['qwen3-vl-4b'],
      extraArgs: ['--cache-ram', '0']
    })
  })

  it('runs Qwen3.5 9B with thinking off, its own prompt and the prompt cache off', async () => {
    const { factory, createVision } = setup(['qwen3.5-9b/model.gguf', 'qwen3.5-9b/mmproj.gguf'])
    await factory.forModel('qwen3.5-9b')
    expect(createVision.mock.calls[0]![0]).toMatchObject({
      name: 'Qwen3.5 9B',
      prompt: PROMPT_PROFILES['qwen3.5-9b'],
      extraArgs: ['--cache-ram', '0', '--reasoning', 'off']
    })
  })

  it('names a model that is not in the catalogue by its id, with the default prompt', async () => {
    const { factory, createVision } = setup(['custom/model.gguf', 'custom/mmproj.gguf'])
    await factory.forModel('custom')
    expect(createVision.mock.calls[0]![0]).toMatchObject({
      name: 'custom',
      prompt: PROMPT_PROFILES['qwen3-vl-4b'],
      extraArgs: ['--cache-ram', '0']
    })
  })

  it('has no provider for an old text-only model (no mmproj)', async () => {
    const { factory, createVision } = setup(['phi-3.5-mini/model.gguf'])
    await expect(factory.forModel('phi-3.5-mini')).resolves.toBeNull()
    expect(createVision).not.toHaveBeenCalled()
  })

  it('has no provider when the model file is missing', async () => {
    const { factory } = setup(['m/mmproj.gguf'])
    await expect(factory.forModel('m')).resolves.toBeNull()
  })

  it('has no provider when llama-server is not installed, and says so once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { factory, createVision } = setup(['m/model.gguf', 'm/mmproj.gguf'], {
      llamaServerPath: () => null
    })
    await expect(factory.forModel('m')).resolves.toBeNull()
    await expect(factory.forModel('m')).resolves.toBeNull()
    expect(createVision).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('reuses the provider while the same model stays active', async () => {
    const { factory, createVision } = setup(['m/model.gguf', 'm/mmproj.gguf'])
    const first = await factory.forModel('m')
    const second = await factory.forModel('m')
    expect(second).toBe(first)
    expect(createVision).toHaveBeenCalledOnce()
  })

  it('stops the previous model when another one becomes active', async () => {
    const { factory } = setup(['a/model.gguf', 'a/mmproj.gguf', 'b/model.gguf', 'b/mmproj.gguf'])
    const a = (await factory.forModel('a')) as ReturnType<typeof stubProvider>
    const b = await factory.forModel('b')
    expect(a.dispose).toHaveBeenCalledOnce()
    expect(b).not.toBe(a)
  })

  it('dispose() stops the running provider', async () => {
    const { factory } = setup(['a/model.gguf', 'a/mmproj.gguf'])
    const a = (await factory.forModel('a')) as ReturnType<typeof stubProvider>
    await factory.dispose()
    expect(a.dispose).toHaveBeenCalledOnce()
  })
})

describe('Apple’s on-device model', () => {
  const DESCRIBED = JSON.stringify({
    title: 'Tape roll on a wall',
    description: 'A roll of tape on a white wall.',
    tags: [{ category: 'Print & Branding', label: 'tape' }]
  })

  function appleSetup(available: boolean) {
    const helper = { describe: vi.fn(async () => ({ text: DESCRIBED, json: true, ms: 1 })) }
    const availability = { available: vi.fn(async () => available) }
    const { factory, createVision } = setup([], { apple: { helper, availability } })
    return { factory, createVision, helper, availability }
  }

  it('is an AppleInferenceProvider over the helper, asked with the apple prompt', async () => {
    const { factory, createVision, helper } = appleSetup(true)
    const provider = await factory.forModel('apple')
    expect(provider).toBeInstanceOf(AppleInferenceProvider)
    expect(createVision).not.toHaveBeenCalled()
    const result = await provider!.analyze({ imagePath: '', fileName: 'Tape.psd', folderTrail: [] })
    expect(result.title).toBe('Tape roll on a wall')
    expect(helper.describe).toHaveBeenCalledOnce()
  })

  it('has no provider when the helper says the model is not available', async () => {
    const { factory } = appleSetup(false)
    await expect(factory.forModel('apple')).resolves.toBeNull()
  })

  it('has no provider without a helper', async () => {
    const { factory } = setup([])
    await expect(factory.forModel('apple')).resolves.toBeNull()
  })

  it('stops the running llama-server when Apple’s model becomes active', async () => {
    const helper = { describe: vi.fn() }
    const { factory } = setup(['qwen3-vl-4b/model.gguf', 'qwen3-vl-4b/mmproj.gguf'], {
      apple: { helper, availability: { available: async () => true } }
    })
    const qwen = (await factory.forModel('qwen3-vl-4b')) as ReturnType<typeof stubProvider>
    await factory.forModel('apple')
    expect(qwen.dispose).toHaveBeenCalledOnce()
  })
})

describe('server args', () => {
  it('turns off llama-server’s host prompt cache for every model, known or not', () => {
    for (const args of Object.values(MODEL_SERVER_ARGS)) expect(args).toContain('--cache-ram')
    expect(serverArgsFor('qwen3-vl-4b')).toEqual(['--cache-ram', '0'])
    expect(serverArgsFor('someone-elses-model')).toEqual(['--cache-ram', '0'])
  })

  it('runs Qwen3.5 9B with thinking off', () => {
    expect(serverArgsFor('qwen3.5-9b')).toEqual(['--cache-ram', '0', '--reasoning', 'off'])
  })
})

describe('resolveLlamaServerPath', () => {
  const DEV =
    '/Users/me/Library/Application Support/DesignStash-dev/llama-server/current/llama-server'
  const BUNDLED = '/App/Resources/llama-server/llama-server'

  it('prefers DESIGNSTASH_LLAMA_SERVER', () => {
    const all = () => true
    expect(
      resolveLlamaServerPath(
        { DESIGNSTASH_LLAMA_SERVER: '/custom/llama-server' },
        '/App/Resources',
        '/Users/me',
        all
      )
    ).toBe('/custom/llama-server')
  })

  it('then the bundled copy, then the development copy', () => {
    expect(resolveLlamaServerPath({}, '/App/Resources', '/Users/me', () => true)).toBe(BUNDLED)
    expect(resolveLlamaServerPath({}, '/App/Resources', '/Users/me', (p) => p === DEV)).toBe(DEV)
    expect(resolveLlamaServerPath({}, undefined, '/Users/me', (p) => p === DEV)).toBe(DEV)
  })

  it('is null when none of them exists', () => {
    expect(
      resolveLlamaServerPath(
        { DESIGNSTASH_LLAMA_SERVER: '/nope' },
        '/App/Resources',
        '/Users/me',
        () => false
      )
    ).toBeNull()
  })
})

describe('the end-to-end test stub', () => {
  it('is only on when both the stub switch and NODE_ENV=test are set', async () => {
    const { stubAiEnabled, STUB_AI_ENV } = await import('./provider-factory')
    expect(stubAiEnabled({ [STUB_AI_ENV]: '1', NODE_ENV: 'test' })).toBe(true)
    expect(stubAiEnabled({ [STUB_AI_ENV]: '1', NODE_ENV: 'production' })).toBe(false)
    expect(stubAiEnabled({ [STUB_AI_ENV]: '1' })).toBe(false)
    expect(stubAiEnabled({ NODE_ENV: 'test' })).toBe(false)
  })

  it('answers deterministically from the file name', async () => {
    const { stubProvider } = await import('./provider-factory')
    expect(await stubProvider.analyze({ imagePath: '/x.webp', fileName: 'phone_front.psd', folderTrail: [] })).toEqual({
      title: 'Stub phone_front',
      description: 'A stub description for phone_front.',
      tags: [{ category: 'Device', label: 'phone' }]
    })
  })

  it('answers a real test-set file with a believable suggestion, valid and with seeded tags', async () => {
    const { stubProvider } = await import('./provider-factory')
    const { STUB_SUGGESTIONS } = await import('./stub-suggestions')
    const { TAXONOMY } = await import('../db/bootstrap')
    expect(
      await stubProvider.analyze({
        imagePath: '/x.webp',
        fileName: 'Matt_Can_Mockup.psd',
        folderTrail: []
      })
    ).toMatchObject({
      title: 'Pink and white matte drink can'
    })
    const seeded = new Set(TAXONOMY.flatMap((c) => c.tags.map((t) => `${c.label}/${t}`)))
    const titles = Object.values(STUB_SUGGESTIONS).map((s) => s.title)
    // Specs find cards by title, so no two are the same.
    expect(new Set(titles).size).toBe(titles.length)
    for (const s of Object.values(STUB_SUGGESTIONS)) {
      expect(InferenceResultSchema.parse(s)).toEqual(s)
      for (const t of s.tags)
        expect(seeded, `${s.title}: ${t.label}`).toContain(`${t.category}/${t.label}`)
    }
  })
})
