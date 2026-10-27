import { isMeaningModel } from '../ai/registry'
import type { ModelDownloader } from '../ai/download'
import type { EmbeddingService } from '../search/embedding-service'
import type { SettingsStore } from '../settings'

/**
 * Delete model's undo and redo (design/specs/undo.md): a set-aside model brought back, active
 * again when it was, or set aside again. Each says whether the model's files were there.
 */
export function modelUndoOps(deps: {
  downloader: Pick<ModelDownloader, 'restoreSetAside' | 'setAside'>
  embeddings: Pick<EmbeddingService, 'backfill' | 'modelRemoved'>
  settings: Pick<SettingsStore, 'get' | 'update'>
}): {
  restore(id: string, makeActive: boolean): Promise<boolean>
  setAside(id: string): Promise<boolean>
} {
  const { downloader, embeddings, settings } = deps
  return {
    async restore(id, makeActive) {
      const restored = await downloader.restoreSetAside(id)
      if (restored && isMeaningModel(id)) embeddings.backfill()
      if (restored && makeActive) settings.update({ activeModelId: id })
      return restored
    },
    async setAside(id) {
      const setAside = await downloader.setAside(id)
      if (setAside && settings.get().activeModelId === id) settings.update({ activeModelId: null })
      if (setAside && isMeaningModel(id)) await embeddings.modelRemoved()
      return setAside
    }
  }
}
