import { SCENE_THINGS } from '../scene-check'
import { parseResult } from '../vision-provider'
import type { PromptProfile } from './profile'
import { NAMES_ONLY, SHIPPED, requestFrom } from './request'

/**
 * Apple's on-device model, through the Swift helper's `describe` (eval version ap-6): the shipped
 * prompt with a names rule that also takes the mockup type from the names, the names-only rules, and
 * the scene-thing check as greedy yes/no answers. Only the instructions, prompt, schema and
 * `max_tokens` reach the model (`appleDescribeRequest`): the helper decodes greedily, so the
 * sampling settings are ignored, and the schema loses its `pattern`s.
 */
export const profile: PromptProfile = {
  buildRequest: requestFrom({
    ...SHIPPED,
    namesRule:
      'The image shows what the mockup is. The names often say what kind of mockup it is or the product it shows (a long scroll website, a mailer box, an iPhone 16, an Apple Watch Ultra). When the image fits, use those words.',
    noImage: NAMES_ONLY
  }),
  parseResult,
  sceneThings: SCENE_THINGS
}
