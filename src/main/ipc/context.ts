import { join } from 'node:path'
import { app, shell, type BrowserWindow } from 'electron'
import type { PushChannel, PushPayload } from '@shared/ipc'
import type { InferenceProvider } from '@shared/inference'
import type { SettingsStore } from '../settings'
import type { Telemetry } from '../telemetry'
import type { Repository } from '../db/repository'
import { forgetRemovedModel } from '../ai/active-model'
import { createAppleAvailability, type AppleStatus } from '../ai/apple-availability'
import { ModelDownloader } from '../ai/download'
import { LlamaPidFile } from '../ai/llama-pid'
import {
  createProviderFactory,
  resolveLlamaServerPath,
  stubAiEnabled
} from '../ai/provider-factory'
import { getModel, isBuiltIn } from '../ai/registry'
import { NativeHelper, resolveHelperPath } from '../native/helper'
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
  /** Whether Apple's on-device model can run here, and why not (the Swift helper's `info`, cached a while). */
  appleStatus(): Promise<AppleStatus>
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
  // Qwen 2.5 VL 3B or 7B, chosen before the switch, reads as no model chosen.
  forgetRemovedModel(settings)

  // The Swift helper starts on first use and stops itself when idle.
  const helper = new NativeHelper({ binaryPath: resolveHelperPath() })
  const apple = createAppleAvailability({ helper })

  // A llama-server left running by a crashed or killed app is stopped now, and this run's is
  // remembered so the next launch can do the same.
  const pidFile = new LlamaPidFile(join(modelsDir, '..', 'llama-server.pid'))
  void pidFile.reapStale().catch(() => {})
  const providers = createProviderFactory({
    modelsDir,
    llamaServerPath: () => resolveLlamaServerPath(),
    pidFile,
    apple: { helper, availability: apple }
  })
  // A normal quit stops them too, rather than leaving that to the process exit hook.
  app.on('will-quit', () => {
    void providers.dispose().catch(() => {})
    void helper.stop().catch(() => {})
  })

  return {
    modelsDir,
    downloader,
    activeDownloads: new Map(),
    async activeProvider() {
      const activeModelId = settings.get().activeModelId
      const model = activeModelId ? getModel(activeModelId) : undefined
      if (!model) return null
      // A built-in model has no files; the factory asks the helper whether it can run.
      if (!isBuiltIn(model) && !(await downloader.isInstalled(model.id))) return null
      return providers.forModel(model.id)
    },
    // End-to-end runs never ask the real helper, so what they see doesn't depend on the Mac.
    appleStatus: () =>
      stubAiEnabled() ? Promise.resolve({ available: false, reason: 'unknown' }) : apple.status()
  }
}

/**
 * A push that goes to whichever window is open when it is sent. With no window (macOS keeps the
 * app alive after the last one closes) or a destroyed one, it does nothing.
 */
export function createPush(getWindow: () => BrowserWindow | null): HandlerContext['push'] {
  return (channel, payload) => {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(channel, payload)
  }
}

export function createHandlerContext(opts: {
  settings: SettingsStore
  telemetry: TelemetryRef
  repo: Repository
  getWindow: () => BrowserWindow | null
}): HandlerContext {
  return {
    settings: opts.settings,
    telemetry: opts.telemetry,
    repo: opts.repo,
    ai: createAiRuntime(opts.settings),
    library: new LibraryService(opts.repo, opts.settings.getLibraryRoot(), {
      openPath: (p) => shell.openPath(p)
    }),
    push: createPush(opts.getWindow)
  }
}
