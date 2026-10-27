import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, shell, type BrowserWindow } from 'electron'
import { IPC_CHANNELS, type PushChannel, type PushPayload } from '@shared/ipc'
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
import { LlamaServer } from '../ai/llama-server'
import { HOST_PROMPT_CACHE_OFF } from '../ai/provider-factory'
import { MODEL_FILE_NAMES } from '../ai/registry'
import { LlamaMeaningEmbedder } from '../search/embedder'
import { EmbeddingService } from '../search/embedding-service'
import { MEANING_MODEL_ID } from '../search/meaning'
import { getDb } from '../db/connection'
import { createDataOps, type DataOps } from '../undo/ops'
import { createUndoService, type UndoService } from '../undo/undo-service'
import { modelUndoOps } from '../undo/model-ops'
import type { UndoMenuItems } from '../undo/menu-items'

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
  /** Meaning search: the vectors, their queue, and the closeness of each mockup to a search. */
  embeddings: EmbeddingService
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
  /** The app's undo history: each undoable handler records its action here (design/specs/undo.md). */
  undo: UndoService
  /** Data's side of undo: runs an action and returns it as an undo record (`track`). */
  dataOps: DataOps
}

export function createAiRuntime(
  settings: SettingsStore,
  repo: Repository,
  userDataDir: string
): AiRuntime {
  // Models are app data, so moving or pointing the stash folder never leaves them behind.
  const modelsDir = join(userDataDir, 'models')
  const downloader = new ModelDownloader(modelsDir)
  // Earlier versions kept them beside the stash folder; any found there move in now.
  void downloader.adopt(join(settings.getLibraryRoot(), '..', 'models'))
  // Qwen 2.5 VL 3B or 7B, chosen before the switch, reads as no model chosen.
  forgetRemovedModel(settings)

  // The Swift helper starts on first use and stops itself when idle.
  const helper = new NativeHelper({ binaryPath: resolveHelperPath() })
  const apple = createAppleAvailability({ helper })

  // A llama-server left running by a crashed or killed app is stopped now, and this run's is
  // remembered so the next launch can do the same.
  const pidFile = new LlamaPidFile(join(userDataDir, 'llama-server.pid'))
  void pidFile.reapStale().catch(() => {})
  const providers = createProviderFactory({
    modelsDir,
    llamaServerPath: () => resolveLlamaServerPath(),
    pidFile,
    apple: { helper, availability: apple }
  })

  // Meaning search runs a second llama-server in embedding mode, with its own pid file.
  const embedPidFile = new LlamaPidFile(join(userDataDir, 'llama-server-embed.pid'))
  void embedPidFile.reapStale().catch(() => {})
  const meaningModelPath = join(modelsDir, MEANING_MODEL_ID, MODEL_FILE_NAMES.model)
  const embeddings = new EmbeddingService({
    repo,
    available: () =>
      !stubAiEnabled() && existsSync(meaningModelPath) && resolveLlamaServerPath() !== null,
    embedder: () =>
      new LlamaMeaningEmbedder(
        new LlamaServer({
          binaryPath: resolveLlamaServerPath() ?? '',
          modelPath: meaningModelPath,
          embedding: true,
          ctxSize: 2048,
          startTimeoutMs: 60_000,
          requestTimeoutMs: 20_000,
          extraArgs: HOST_PROMPT_CACHE_OFF,
          tracker: embedPidFile
        })
      ),
    log: (message, err) => console.error(`[search] ${message}:`, err)
  })
  repo.search.setIndexListener((id, text) => embeddings.documentChanged(id, text))
  // Catch up on mockups that have no vector yet, once the app has settled and behind AI suggestions.
  const backfillTimer = setTimeout(() => embeddings.backfill(), 15_000)
  backfillTimer.unref()

  // A normal quit stops them too, rather than leaving that to the process exit hook.
  app.on('will-quit', () => {
    clearTimeout(backfillTimer)
    void providers.dispose().catch(() => {})
    void helper.stop().catch(() => {})
    void embeddings.stop().catch(() => {})
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
      stubAiEnabled() ? Promise.resolve({ available: false, reason: 'unknown' }) : apple.status(),
    embeddings
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
  /** Puts the history's labels on Edit › Undo and Redo. */
  undoMenu?: (items: UndoMenuItems) => void
}): HandlerContext {
  const push = createPush(opts.getWindow)
  const dataOps = createDataOps({ repo: opts.repo, db: getDb() })
  const ai = createAiRuntime(opts.settings, opts.repo, app.getPath('userData'))
  const { settings } = opts
  return {
    settings,
    telemetry: opts.telemetry,
    repo: opts.repo,
    ai,
    library: new LibraryService(opts.repo, opts.settings.getLibraryRoot(), {
      openPath: (p) => shell.openPath(p)
    }),
    push,
    dataOps,
    undo: createUndoService({
      data: dataOps.runner,
      settings: opts.settings,
      push: (state) => push(IPC_CHANNELS.UNDO_STATE, state),
      menu: opts.undoMenu ?? (() => {}),
      // Delete model sets a model aside until quit; its undo brings it back.
      models: modelUndoOps({ downloader: ai.downloader, embeddings: ai.embeddings, settings }),
      editField: (direction) => {
        const window = opts.getWindow()
        if (!window || window.isDestroyed()) return
        if (direction === 'undo') window.webContents.undo()
        else window.webContents.redo()
      }
    })
  }
}
