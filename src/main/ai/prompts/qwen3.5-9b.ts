import { SCENE_THINGS } from '../scene-check'
import { parseResult } from '../vision-provider'
import type { PromptProfile } from './profile'
import { NAMES_ONLY, SHIPPED, requestFrom } from './request'

/**
 * Qwen3.5 9B, run with thinking off: the shipped prompt, the names-only rules for a cover with no
 * image, and the scene-thing check (eval versions q9-2 and ck-2).
 */
export const profile: PromptProfile = {
  buildRequest: requestFrom({ ...SHIPPED, noImage: NAMES_ONLY }),
  parseResult,
  sceneThings: SCENE_THINGS
}
