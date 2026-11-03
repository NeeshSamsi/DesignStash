import { SCENE_THINGS } from '../scene-check'
import { parseResult } from '../vision-provider'
import type { PromptProfile } from './profile'
import { NAMES_ONLY, SHIPPED, requestFrom } from './request'

/**
 * Qwen3-VL 4B Instruct: the shipped prompt, the names-only rules for a cover with no image, and the
 * scene-thing check (eval version ck-2; the 4B's own rewrites, q4-*, scored no better).
 */
export const profile: PromptProfile = {
  buildRequest: requestFrom({ ...SHIPPED, noImage: NAMES_ONLY }),
  parseResult,
  sceneThings: SCENE_THINGS
}
