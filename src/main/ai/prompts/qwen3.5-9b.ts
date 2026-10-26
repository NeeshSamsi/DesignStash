import { SCENE_THINGS } from '../scene-check'
import { parseResult } from '../vision-provider'
import type { PromptProfile } from './profile'
import { MASK_RULE, NAMES_ONLY, SHIPPED, requestFrom } from './request'

/**
 * Qwen3.5 9B, run with thinking off: the shipped prompt, the names-only rules for a cover with no
 * image, and the scene-thing check (eval versions q9-2 and ck-2), with round 3's placeholder check
 * (eval ck-9d, design/research/ai-round3.md). The 9B reads exact names from the sample art ("iPhone
 * 15" from the screen's text), and a masked cover cost it 2 to 7 points of recall, so it answers
 * from the cover as it is. Each colour or pattern word in that answer is then asked about on the
 * cover with its slot blurred grey; when one is only on the slot, the answer is made again from the
 * labelled cover (`MASK_RULE`), given the first answer less those words. A refusal asks once more.
 * It judges pile edits on the cover as it is (round 3 C, eval c3 and c4), and names a pile's
 * variations in one request (35 of 41 right on round 4's piles, about 4 s a pile).
 */
export const profile: PromptProfile = {
  buildRequest: requestFrom({ ...SHIPPED, noImage: NAMES_ONLY, maskRule: MASK_RULE }),
  parseResult,
  sceneThings: SCENE_THINGS,
  verify: { check: 'soft', remask: 'label' },
  redo: true,
  pileEdits: { judge: true },
  variations: true
}
