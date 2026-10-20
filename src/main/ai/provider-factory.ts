import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InferenceProvider } from '../../shared/inference'
import { LlamaServer } from './llama-server'
import { MODEL_FILE_NAMES, getModel } from './registry'
import { VisionInferenceProvider, readCoverAsDataUrl } from './vision-provider'

/** A provider the factory can stop when the active model changes. */
type ManagedProvider = InferenceProvider & { dispose?(): Promise<void> }

/** What the factory hands over to build a vision provider. */
export interface VisionModelFiles {
  name: string
  modelPath: string
  mmprojPath: string
  binaryPath: string
  extraArgs: readonly string[]
}

/**
 * llama-server flags a model needs. Moondream 2's own (jinja) chat template drops the image
 * marker, so every image request fails to tokenize; the built-in vicuna template keeps it.
 */
export const MODEL_SERVER_ARGS: Record<string, readonly string[]> = {
  moondream2: ['--no-jinja', '--chat-template', 'vicuna']
}

/** Set by the end-to-end tests, together with NODE_ENV=test, to answer with the stub below instead of a model. */
export const STUB_AI_ENV = 'DESIGNSTASH_E2E_STUB_AI'

export const stubProvider: InferenceProvider = {
  id: 'e2e-stub',
  name: 'Test stub',
  async analyze(input) {
    const stem = input.fileName.replace(/\.[^/.]+$/, '')
    return {
      title: `Stub ${stem}`,
      description: `A stub description for ${stem}.`,
      tags: [{ category: 'Device', label: 'phone' }]
    }
  }
}

/** The stub is only ever used in a test run, never in a build people use. */
export function stubAiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[STUB_AI_ENV] === '1' && env.NODE_ENV === 'test'
}

export interface ProviderFactoryOptions {
  modelsDir: string
  /** Where `llama-server` is, or null when it isn't installed. */
  llamaServerPath: () => string | null
  exists?: (path: string) => boolean
  /** Builds the provider for a vision model. Tests replace it so no child process starts. */
  createVision?: (files: VisionModelFiles) => ManagedProvider
}

export interface ProviderFactory {
  /** The provider for an installed model, or null when its files or the runtime are missing. */
  forModel(id: string): Promise<InferenceProvider | null>
  /** Stop the running provider (and its llama-server). */
  dispose(): Promise<void>
}

function createVisionProvider(files: VisionModelFiles): ManagedProvider {
  const server = new LlamaServer({
    binaryPath: files.binaryPath,
    modelPath: files.modelPath,
    mmprojPath: files.mmprojPath,
    extraArgs: files.extraArgs
  })
  return new VisionInferenceProvider(files.name, {
    complete: (request) => server.chat(request),
    readImage: readCoverAsDataUrl,
    dispose: () => server.stop()
  })
}

/**
 * Builds the provider for the active model from its files at `<modelsDir>/<id>/`: the GGUF and
 * its mmproj, run by llama-server. A folder without an mmproj (an old text-only model) has no
 * provider. One provider, so one llama-server, at a time: switching models stops the previous one.
 */
export function createProviderFactory(options: ProviderFactoryOptions): ProviderFactory {
  const exists = options.exists ?? existsSync
  const createVision = options.createVision ?? createVisionProvider
  let current: { id: string; provider: ManagedProvider } | null = null
  let warnedNoServer = false

  async function dispose(): Promise<void> {
    const previous = current
    current = null
    await previous?.provider.dispose?.()
  }

  function build(id: string): ManagedProvider | null {
    const modelPath = join(options.modelsDir, id, MODEL_FILE_NAMES.model)
    const mmprojPath = join(options.modelsDir, id, MODEL_FILE_NAMES.mmproj)
    if (!exists(modelPath) || !exists(mmprojPath)) return null

    const binaryPath = options.llamaServerPath()
    if (!binaryPath) {
      if (!warnedNoServer) {
        console.warn('[ai] llama-server not found; run `node scripts/fetch-llama-server.mjs`.')
        warnedNoServer = true
      }
      return null
    }
    return createVision({
      name: getModel(id)?.name ?? id,
      modelPath,
      mmprojPath,
      binaryPath,
      extraArgs: MODEL_SERVER_ARGS[id] ?? []
    })
  }

  return {
    async forModel(id) {
      if (stubAiEnabled()) return stubProvider
      if (current?.id === id) return current.provider
      await dispose()
      const provider = build(id)
      if (provider) current = { id, provider }
      return provider
    },
    dispose
  }
}

/**
 * Where llama-server lives: `DESIGNSTASH_LLAMA_SERVER` if set, then the app's bundled
 * resources (once packaging exists), then the development copy that
 * `scripts/fetch-llama-server.mjs` puts outside the repo.
 */
export function resolveLlamaServerPath(
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string | undefined = process.resourcesPath,
  home: string = homedir(),
  exists: (path: string) => boolean = existsSync
): string | null {
  const candidates = [
    env.DESIGNSTASH_LLAMA_SERVER,
    resourcesPath ? join(resourcesPath, 'llama-server', 'llama-server') : undefined,
    join(
      home,
      'Library',
      'Application Support',
      'DesignStash-dev',
      'llama-server',
      'current',
      'llama-server'
    )
  ]
  return candidates.find((p): p is string => !!p && exists(p)) ?? null
}
