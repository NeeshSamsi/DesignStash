import { SCENE_THINGS } from '../scene-check'
import { parseResult } from '../vision-provider'
import type { PromptProfile } from './profile'
import { NAMES_ONLY, SHIPPED, requestFrom } from './request'

/**
 * Apple's on-device model, through the Swift helper's `describe` (eval version ap-10s, round 3): the
 * shipped prompt with a names rule that also takes the mockup type from the names, the names-only
 * rules, and the scene-thing check as greedy yes/no answers. The model answers from the cover with its
 * design slot blurred in grey (`soft`), so it never describes the placeholder; the check looks at the
 * cover as it is, and a refusal asks once more. On the tuning, held-out and sign-off sets this cut
 * placeholder mentions from about half the answers to 5 to 7% and raised search recall by 2 to 4
 * points, with no more invented things (design/research/ai-round3.md). Only the instructions, prompt, schema and
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
  sceneThings: SCENE_THINGS,
  mask: 'soft',
  redo: true
}
