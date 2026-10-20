import { describe, it, expect, vi, afterEach } from 'vitest'
import { join } from 'node:path'
import type { InferenceProvider } from '../../shared/inference'
import {
  createProviderFactory,
  resolveLlamaServerPath,
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
  it('runs a model with an mmproj as a vision model on llama-server', async () => {
    const { factory, createVision } = setup([
      'qwen2.5-vl-3b/model.gguf',
      'qwen2.5-vl-3b/mmproj.gguf'
    ])
    const provider = await factory.forModel('qwen2.5-vl-3b')
    expect(provider?.id).toBe('vision')
    expect(createVision).toHaveBeenCalledWith({
      name: 'Qwen 2.5 VL 3B',
      modelPath: '/models/qwen2.5-vl-3b/model.gguf',
      mmprojPath: '/models/qwen2.5-vl-3b/mmproj.gguf',
      binaryPath: '/bin/llama-server',
      extraArgs: []
    })
  })

  it('names a model that is not in the catalogue by its id', async () => {
    const { factory, createVision } = setup(['custom/model.gguf', 'custom/mmproj.gguf'])
    await factory.forModel('custom')
    expect(createVision.mock.calls[0]![0].name).toBe('custom')
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
})
