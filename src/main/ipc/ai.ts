import { IPC_CHANNELS } from '@shared/ipc'
import type { AiActiveProblem } from '@shared/ipc/ai'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { detectHardware, recommendTier } from '../ai/hardware'
import { DownloadError, assertSafeId, classifyDownloadError } from '../ai/download'
import { resolveLlamaServerPath } from '../ai/provider-factory'
import {
  MEANING_MODEL,
  MODEL_REGISTRY,
  availableModels,
  bestFitModelId,
  getModel,
  isBuiltIn,
  isMeaningModel
} from '../ai/registry'
import { inferenceQueueFor } from './library-effects'
import { undoEntry } from '../undo/undo-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

/** Why the active model (Apple's) can't run, as the renderer words it. */
function appleProblem(reason: string | null): AiActiveProblem {
  if (reason === 'appleIntelligenceNotEnabled') return 'apple-intelligence-off'
  if (reason === 'modelNotReady') return 'apple-model-not-ready'
  return 'apple-unavailable'
}

/** What the handlers ask about the runtime, so tests can say it without a real one. */
export interface AiHandlerDeps {
  /** The llama-server the app runs models on, or null when it is missing. */
  llamaServerPath(): string | null
  /** 'runtime-failed' once the active model's runtime has failed to start twice in a row. */
  runtimeProblem(): 'runtime-failed' | null
}

export function registerAiHandlers(
  ctx: HandlerContext,
  deps: AiHandlerDeps = {
    llamaServerPath: () => resolveLlamaServerPath(),
    runtimeProblem: () => inferenceQueueFor(ctx).runtimeProblem
  }
): void {
  const { settings, telemetry, ai, push } = ctx
  const { downloader, activeDownloads } = ai

  // Meaning-search vectors wait for suggestions to finish first.
  ai.embeddings.setBusyCheck(() => inferenceQueueFor(ctx).busy)

  /** The active model changed or arrived: the queue asks again for what waited for a model. */
  const modelChanged = () =>
    void inferenceQueueFor(ctx)
      .modelChanged()
      .catch((err: unknown) => console.error('[AI] Could not queue suggestions:', err))

  // Models deleted last session can no longer be undone.
  void downloader.purgeSetAside().catch(() => {})

  registerIpcHandler(IPC_CHANNELS.AI_HARDWARE_INFO, () => {
    const hw = detectHardware()
    return { ...hw, recommendedTier: recommendTier(hw) }
  })

  registerIpcHandler(IPC_CHANNELS.AI_LIST_MODELS, async () => {
    const activeModelId = settings.get().activeModelId
    const bestFit = bestFitModelId(detectHardware())
    // Apple's model is offered only where it can run: macOS 27 with Apple Intelligence on.
    const apple = await ai.appleStatus()
    const offered = availableModels().filter((entry) => !isBuiltIn(entry) || apple.available)
    const models = await Promise.all(
      offered.map(async (entry) => ({
        id: entry.id,
        name: entry.name,
        tier: entry.tier,
        sizeBytes: entry.sizeBytes,
        description: entry.description,
        languages: entry.languages,
        quality: entry.quality,
        speed: entry.speed,
        minMemoryGB: entry.minMemoryGB,
        bestFit: entry.id === bestFit,
        builtIn: isBuiltIn(entry),
        downloadedBytes: await downloader.downloadedBytes(entry.id),
        installed: isBuiltIn(entry) || (await downloader.isInstalled(entry.id)),
        active: entry.id === activeModelId
      }))
    )
    const active = activeModelId ? getModel(activeModelId) : undefined
    const activeInstalled = models.find((m) => m.active)?.installed ?? false
    // Apple's model can be off in macOS; a downloaded model can have no runtime, or one that won't start.
    const activeProblem: AiActiveProblem | null = !active
      ? null
      : isBuiltIn(active)
        ? apple.available
          ? null
          : appleProblem(apple.reason)
        : !activeInstalled
          ? null
          : deps.llamaServerPath() === null
            ? 'runtime-missing'
            : deps.runtimeProblem()
    return {
      models,
      meaning: {
        id: MEANING_MODEL.id,
        name: MEANING_MODEL.name,
        description: MEANING_MODEL.description,
        license: MEANING_MODEL.license,
        sizeBytes: MEANING_MODEL.sizeBytes,
        downloadedBytes: await downloader.downloadedBytes(MEANING_MODEL.id),
        installed: await downloader.isInstalled(MEANING_MODEL.id)
      },
      legacy: await downloader.listLegacy(),
      activeProblem
    }
  })

  registerIpcHandler(IPC_CHANNELS.AI_DOWNLOAD_MODEL, (args) => {
    if (activeDownloads.has(args.id)) return { started: false }
    const controller = new AbortController()
    activeDownloads.set(args.id, controller)
    const startedAt = Date.now()
    // Telemetry: the catalogue id, its size and how long it took. Never a path.
    const sizeMb = Math.round(
      ((isMeaningModel(args.id) ? MEANING_MODEL : getModel(args.id))?.sizeBytes ?? 0) / 1_000_000
    )
    void downloader
      .download(args.id, {
        signal: controller.signal,
        onProgress: (p) => {
          push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, p)
        }
      })
      .then(() => {
        // Meaning search catches up on the library now that its model is there.
        if (isMeaningModel(args.id)) ai.embeddings.backfill()
        // The active model is there now: what waited for one gets its suggestions (H-2).
        if (args.id === settings.get().activeModelId) modelChanged()
        telemetry.get().track(TELEMETRY_EVENTS.MODEL_DOWNLOAD_FINISHED, {
          model_id: args.id,
          size_mb: sizeMb,
          duration_s: Math.round((Date.now() - startedAt) / 1000)
        })
      })
      .catch((err: unknown) => {
        const failure = classifyDownloadError(err)
        if (failure.name === 'AbortError') return
        telemetry.get().track(TELEMETRY_EVENTS.MODEL_DOWNLOAD_FAILED, {
          model_id: args.id,
          size_mb: sizeMb,
          duration_s: Math.round((Date.now() - startedAt) / 1000),
          reason: failure instanceof DownloadError ? failure.reason : 'server'
        })
        // Only the reason goes to the screen, never the system's own message.
        push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, {
          modelId: args.id,
          receivedBytes: 0,
          totalBytes: 0,
          phase: 'error',
          reason: failure instanceof DownloadError ? failure.reason : 'server'
        })
      })
      .finally(() => {
        // A cancelled download settles late. By then the same model may have been started again,
        // and that newer controller is not this one's to remove.
        if (activeDownloads.get(args.id) === controller) activeDownloads.delete(args.id)
      })
    return { started: true }
  })

  registerIpcHandler(IPC_CHANNELS.AI_CANCEL_DOWNLOAD, (args) => {
    const controller = activeDownloads.get(args.id)
    if (controller) {
      controller.abort()
      activeDownloads.delete(args.id)
      return { cancelled: true }
    }
    return { cancelled: false }
  })

  registerIpcHandler(IPC_CHANNELS.AI_DELETE_MODEL, async (args) => {
    assertSafeId(args.id)
    const model = getModel(args.id)
    // A built-in model comes with macOS: there is nothing of ours to delete.
    if (model && isBuiltIn(model)) return { deleted: false, inUse: false, undoable: false }
    const inUse = settings.get().activeModelId === args.id
    if (inUse && !args.confirmed) return { deleted: false, inUse: true, undoable: false }

    // A download in progress stops first.
    activeDownloads.get(args.id)?.abort()
    activeDownloads.delete(args.id)

    const legacy = !model && !isMeaningModel(args.id)
    if (legacy) {
      await downloader.deleteModel(args.id)
      return { deleted: true, inUse: false, undoable: false }
    }
    const deleted = await downloader.setAside(args.id)
    if (deleted && inUse) settings.update({ activeModelId: null })
    // Search goes back to keywords only: the vectors and the server go with the model.
    if (deleted && isMeaningModel(args.id)) await ai.embeddings.modelRemoved()
    // Set aside until quit, so it's in the undo history: its undo brings it back.
    const entry = deleted ? ctx.undo.record(ctx.undo.modelRecord(args.id, inUse)) : undefined
    return { deleted, inUse: deleted && inUse, undoable: deleted, ...undoEntry(entry) }
  })

  registerIpcHandler(IPC_CHANNELS.AI_SET_ACTIVE, (args) => {
    // The meaning-search model is not a vision model; it can never be the active one.
    if (args.id && isMeaningModel(args.id)) return { modelId: settings.get().activeModelId }
    settings.update({ activeModelId: args.id })
    // A model chosen that can run picks up what waited for one; one that can't leaves it off (H-1, H-2).
    modelChanged()
    // Telemetry: hardware/model tier enum only — never the model id beyond its tier.
    if (args.id) {
      const tier = MODEL_REGISTRY.find((m) => m.id === args.id)?.tier
      if (tier) telemetry.get().track(TELEMETRY_EVENTS.MODEL_TIER_CHOSEN, { tier })
    }
    return { modelId: args.id }
  })
}
