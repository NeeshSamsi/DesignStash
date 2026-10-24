import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InferenceProvider } from '../../shared/inference'
import type { NativeHelper } from '../native/helper'
import type { AppleAvailability } from './apple-availability'
import { AppleInferenceProvider } from './apple-provider'
import { LlamaPidFile } from './llama-pid'
import { LlamaServer } from './llama-server'
import { PROMPT_PROFILES, promptProfile, type PromptProfile } from './prompts'
import { MODEL_FILE_NAMES, getModel } from './registry'
import { stubSuggestion } from './stub-suggestions'
import { VisionInferenceProvider, readCoverAsDataUrl } from './vision-provider'

/** A provider the factory can stop when the active model changes. */
type ManagedProvider = InferenceProvider & { dispose?(): Promise<void> }

/** What the factory hands over to build a vision provider. */
export interface VisionModelFiles {
  name: string
  modelPath: string
  mmprojPath: string
  binaryPath: string
  /** The model's prompt profile. */
  prompt: PromptProfile
  extraArgs: readonly string[]
}

/**
 * llama-server keeps up to 8 GB of past prompts in host memory by default, and grew to 10 to 12 GB
 * over long runs in the AI bake-off. The app sends one image per request, so the cache never pays
 * off: `--cache-ram 0` turns it off. The slot's own KV cache still reuses the shared system prompt.
 */
export const HOST_PROMPT_CACHE_OFF = ['--cache-ram', '0'] as const

/** llama-server flags a model needs, by model id. Qwen3.5 thinks unless told not to. */
export const MODEL_SERVER_ARGS: Record<string, readonly string[]> = {
  'qwen3-vl-4b': HOST_PROMPT_CACHE_OFF,
  'qwen3.5-9b': [...HOST_PROMPT_CACHE_OFF, '--reasoning', 'off']
}

/** The flags for a model, the prompt cache off for one outside the catalogue too. */
export function serverArgsFor(id: string): readonly string[] {
  return MODEL_SERVER_ARGS[id] ?? HOST_PROMPT_CACHE_OFF
}

/** What runs Apple's on-device model: the Swift helper, and whether the model is ready. */
export interface AppleRuntime {
  helper: Pick<NativeHelper, 'describe'>
  availability: Pick<AppleAvailability, 'available'>
}

/** Set by the end-to-end tests, together with NODE_ENV=test, to answer with the stub below instead of a model. */
export const STUB_AI_ENV = 'DESIGNSTASH_E2E_STUB_AI'

export const stubProvider: InferenceProvider = {
  id: 'e2e-stub',
  name: 'Test stub',
  async analyze(input) {
    return stubSuggestion(input.fileName)
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
  /** Where the running llama-server's pid is kept, so the next launch can stop one left behind. */
  pidFile?: LlamaPidFile
  /** Apple's on-device model. Without it, the `apple` entry has no provider. */
  apple?: AppleRuntime
}

export interface ProviderFactory {
  /** The provider for an installed model, or null when its files or the runtime are missing. */
  forModel(id: string): Promise<InferenceProvider | null>
  /** Stop the running provider (and its llama-server). */
  dispose(): Promise<void>
}

function createVisionProvider(files: VisionModelFiles, pidFile?: LlamaPidFile): ManagedProvider {
  const server = new LlamaServer({
    binaryPath: files.binaryPath,
    modelPath: files.modelPath,
    mmprojPath: files.mmprojPath,
    extraArgs: files.extraArgs,
    ...(pidFile && { tracker: pidFile })
  })
  return new VisionInferenceProvider(files.name, {
    prompt: files.prompt,
    complete: async (request) => {
      const choice = (await server.complete(request)).choices?.[0]
      const text = choice?.message?.content
      if (typeof text !== 'string') throw new Error('llama-server reply has no message content')
      return { text, logprobs: choice?.logprobs }
    },
    readImage: readCoverAsDataUrl,
    dispose: () => server.stop()
  })
}

/**
 * Builds the provider for the active model. A llama model runs from its files at
 * `<modelsDir>/<id>/`, the GGUF and its mmproj, on llama-server with its own prompt profile and
 * flags; a folder without an mmproj (an old text-only model) has no provider. Apple's model runs
 * through the Swift helper, when the helper says it is available. One provider, so one
 * llama-server, at a time: switching models stops the previous one.
 */
export function createProviderFactory(options: ProviderFactoryOptions): ProviderFactory {
  const exists = options.exists ?? existsSync
  const createVision =
    options.createVision ?? ((files) => createVisionProvider(files, options.pidFile))
  let current: { id: string; provider: ManagedProvider } | null = null
  let warnedNoServer = false

  async function dispose(): Promise<void> {
    const previous = current
    current = null
    await previous?.provider.dispose?.()
  }

  async function buildApple(): Promise<ManagedProvider | null> {
    if (!options.apple || !(await options.apple.availability.available())) return null
    return new AppleInferenceProvider({
      prompt: PROMPT_PROFILES.apple,
      helper: options.apple.helper
    })
  }

  async function build(id: string): Promise<ManagedProvider | null> {
    const entry = getModel(id)
    if (entry?.runtime === 'apple') return buildApple()

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
      name: entry?.name ?? id,
      modelPath,
      mmprojPath,
      binaryPath,
      // A folder outside the catalogue gets the default model's prompt.
      prompt: (entry && promptProfile(entry.prompt)) ?? PROMPT_PROFILES['qwen3-vl-4b'],
      extraArgs: serverArgsFor(id)
    })
  }

  return {
    async forModel(id) {
      if (stubAiEnabled()) return stubProvider
      if (current?.id === id) return current.provider
      await dispose()
      const provider = await build(id)
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
