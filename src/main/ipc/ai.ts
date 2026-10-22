import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { detectHardware, recommendTier } from '../ai/hardware'
import { DownloadError, assertSafeId, classifyDownloadError } from '../ai/download'
import { MODEL_REGISTRY, availableModels, bestFitModelId, getModel, isBuiltIn } from '../ai/registry'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerAiHandlers({ settings, telemetry, ai, push }: HandlerContext): void {
  const { downloader, activeDownloads } = ai

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
    const appleReady = await ai.appleAvailable()
    const offered = availableModels().filter((entry) => !isBuiltIn(entry) || appleReady)
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
    return { models, legacy: await downloader.listLegacy() }
  })

  registerIpcHandler(IPC_CHANNELS.AI_DOWNLOAD_MODEL, (args) => {
    if (activeDownloads.has(args.id)) return { started: false }
    const controller = new AbortController()
    activeDownloads.set(args.id, controller)
    const startedAt = Date.now()
    // Telemetry: the catalogue id, its size and how long it took. Never a path.
    const sizeMb = Math.round((getModel(args.id)?.sizeBytes ?? 0) / 1_000_000)
    void downloader
      .download(args.id, {
        signal: controller.signal,
        onProgress: (p) => {
          push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, p)
        }
      })
      .then(() => {
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

    const legacy = !model
    if (legacy) {
      await downloader.deleteModel(args.id)
      return { deleted: true, inUse: false, undoable: false }
    }
    const deleted = await downloader.setAside(args.id)
    if (deleted && inUse) settings.update({ activeModelId: null })
    return { deleted, inUse: deleted && inUse, undoable: deleted }
  })

  registerIpcHandler(IPC_CHANNELS.AI_RESTORE_MODEL, async (args) => {
    const restored = await downloader.restoreSetAside(args.id)
    if (restored && args.makeActive) settings.update({ activeModelId: args.id })
    return { restored }
  })

  registerIpcHandler(IPC_CHANNELS.AI_SET_ACTIVE, (args) => {
    settings.update({ activeModelId: args.id })
    // Telemetry: hardware/model tier enum only — never the model id beyond its tier.
    if (args.id) {
      const tier = MODEL_REGISTRY.find((m) => m.id === args.id)?.tier
      if (tier) telemetry.get().track(TELEMETRY_EVENTS.MODEL_TIER_CHOSEN, { tier })
    }
    return { modelId: args.id }
  })
}
