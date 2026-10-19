import { join } from 'node:path'
import { shell, type BrowserWindow } from 'electron'
import type { PushChannel, PushPayload } from '@shared/ipc'
import type { InferenceProvider } from '@shared/inference'
import type { SettingsStore } from '../settings'
import type { Telemetry } from '../telemetry'
import type { Repository } from '../db/repository'
import { ModelDownloader } from '../ai/download'
import { LocalInferenceProvider } from '../ai/local-provider'
import { LibraryService } from '../library/library-service'

/**
 * Mutable holder for the telemetry instance. Consent can flip at runtime, so
 * handlers read through `get()` and `rebuild()` swaps the instance via the factory
 * (which decides Noop vs PostHog). All callers stay no-op-safe when consent is off.
 */
export interface TelemetryRef {
  get(): Telemetry
  rebuild(): void
}

/** Model files, downloads and the active inference provider, shared by the AI and approval handlers. */
export interface AiRuntime {
  modelsDir: string
  downloader: ModelDownloader
  activeDownloads: Map<string, AbortController>
  /** The active model's provider, or null when none is set or it isn't installed. */
  activeProvider(): Promise<InferenceProvider | null>
}

/** What every domain's handler module gets. */
export interface HandlerContext {
  settings: SettingsStore
  telemetry: TelemetryRef
  repo: Repository
  ai: AiRuntime
  /** File operations on the library, shared by the mockup and trash handlers. */
  library: LibraryService
  /** Send a push event (PUSH_CHANNELS only) to the renderer. */
  push<C extends PushChannel>(channel: C, payload: PushPayload<C>): void
}

export function createAiRuntime(settings: SettingsStore): AiRuntime {
  const modelsDir = join(settings.getLibraryRoot(), '..', 'models')
  const downloader = new ModelDownloader(modelsDir)

  let cachedProvider: { path: string; provider: LocalInferenceProvider } | null = null
  function getLocalProvider(modelPath: string): LocalInferenceProvider {
    if (cachedProvider?.path !== modelPath) {
      cachedProvider = { path: modelPath, provider: new LocalInferenceProvider(modelPath) }
    }
    return cachedProvider.provider
  }

  return {
    modelsDir,
    downloader,
    activeDownloads: new Map(),
    async activeProvider() {
      const activeModelId = settings.get().activeModelId
      if (!activeModelId) return null
      const installed = await downloader.isInstalled(activeModelId)
      if (!installed) return null
      return getLocalProvider(join(modelsDir, activeModelId, 'model.gguf'))
    }
  }
}

export function createHandlerContext(opts: {
  settings: SettingsStore
  telemetry: TelemetryRef
  repo: Repository
  window: BrowserWindow
}): HandlerContext {
  return {
    settings: opts.settings,
    telemetry: opts.telemetry,
    repo: opts.repo,
    ai: createAiRuntime(opts.settings),
    library: new LibraryService(opts.repo, opts.settings.getLibraryRoot(), {
      openPath: (p) => shell.openPath(p)
    }),
    push: (channel, payload) => opts.window.webContents.send(channel, payload)
  }
}
