import type { SettingsStore } from '../settings'
import { getModel } from './registry'

/**
 * An active model the catalogue no longer has (Qwen 2.5 VL 3B and 7B, replaced after the AI
 * bake-off) reads as no model chosen: the setting is cleared and Settings offers the new models.
 * Its files stay on disk, listed as an old model the person can delete. Returns the id it forgot.
 */
export function forgetRemovedModel(settings: Pick<SettingsStore, 'get' | 'update'>): string | null {
  const id = settings.get().activeModelId
  if (!id || getModel(id)) return null
  settings.update({ activeModelId: null })
  return id
}
