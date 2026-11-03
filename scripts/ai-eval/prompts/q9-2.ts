import { parseResult } from '../../../src/main/ai/vision-provider'
import type { PromptVersion } from './prompt-version'
import { NAMES_ONLY, SHIPPED, requestFrom } from './tunable'

/** Qwen3.5 9B: the shipped prompt plus the names-only rules for a placeholder cover. */
const version: PromptVersion = {
  id: 'q9-2',
  notes: 'Shipped prompt plus names-only description and tag rules.',
  buildRequest: requestFrom({ ...SHIPPED, noImage: NAMES_ONLY }),
  parseResult
}

export default version
