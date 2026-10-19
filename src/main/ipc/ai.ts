import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { detectHardware, recommendTier } from '../ai/hardware'
import { MODEL_REGISTRY } from '../ai/registry'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerAiHandlers({ settings, telemetry, ai, push }: HandlerContext): void {
  const { downloader, activeDownloads } = ai

  registerIpcHandler(IPC_CHANNELS.AI_HARDWARE_INFO, () => {
    const hw = detectHardware()
    return { ...hw, recommendedTier: recommendTier(hw) }
  })

  registerIpcHandler(IPC_CHANNELS.AI_LIST_MODELS, async () => {
    const activeModelId = settings.get().activeModelId
    const models = await Promise.all(
      MODEL_REGISTRY.map(async (entry) => ({
        id: entry.id,
        name: entry.name,
        tier: entry.tier,
        sizeBytes: entry.sizeBytes,
        installed: await downloader.isInstalled(entry.id),
        active: entry.id === activeModelId
      }))
    )
    return { models }
  })

  registerIpcHandler(IPC_CHANNELS.AI_DOWNLOAD_MODEL, (args) => {
    if (activeDownloads.has(args.id)) return { started: false }
    const controller = new AbortController()
    activeDownloads.set(args.id, controller)
    void downloader
      .download(args.id, {
        signal: controller.signal,
        onProgress: (p) => {
          push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, p)
        }
      })
      .then(() => {
        push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, {
          modelId: args.id,
          receivedBytes: 0,
          totalBytes: 0,
          phase: 'done'
        })
      })
      .catch((err: unknown) => {
        const isAbort = err instanceof Error && err.name === 'AbortError'
        if (!isAbort) {
          push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, {
            modelId: args.id,
            receivedBytes: 0,
            totalBytes: 0,
            phase: 'error',
            error: err instanceof Error ? err.message : String(err)
          })
        }
      })
      .finally(() => {
        activeDownloads.delete(args.id)
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

  registerIpcHandler(IPC_CHANNELS.AI_GET_ACTIVE, () => ({
    modelId: settings.get().activeModelId
  }))

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
