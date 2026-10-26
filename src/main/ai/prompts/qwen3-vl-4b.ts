import { SCENE_THINGS } from '../scene-check'
import { parseResult } from '../vision-provider'
import type { PromptProfile } from './profile'
import { MASK_RULE, NAMES_ONLY, SHIPPED, requestFrom } from './request'

/**
 * Qwen3-VL 4B Instruct: the shipped prompt, the names-only rules for a cover with no image, and the
 * scene-thing check (eval ck-2), with round 3's masking (eval ck-7b, design/research/ai-round3.md).
 * The 4B answers from the cover with its design slot painted light grey and labelled DESIGN AREA,
 * told what that area is (`MASK_RULE`), so it never describes the placeholder. Masked, it lost the
 * product's name (it had named products from their sample art), so it is first asked what kind of
 * object the cover as it is shows, and told that name. The scene check looks at the cover as it is,
 * scaled to 512 px (round 4: the same answers, 4% quicker), and a refusal asks once more. Where the
 * label leaves a cover too blank to send (leggings that fill the slot, on a grey ground), the slot is
 * blurred grey instead (eval ck-7e), so the answer still has an image.
 */
export const profile: PromptProfile = {
  buildRequest: requestFrom({ ...SHIPPED, noImage: NAMES_ONLY, maskRule: MASK_RULE }),
  parseResult,
  sceneThings: SCENE_THINGS,
  mask: 'label',
  blankFallback: 'soft',
  objectHint: true,
  checkEdge: 512,
  redo: true
}
