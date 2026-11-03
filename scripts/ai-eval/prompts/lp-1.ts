import { parseResult } from '../../../src/main/ai/vision-provider'
import type { PromptVersion } from './prompt-version'
import { NAMES_ONLY, SHIPPED, requestFrom } from './tunable'

/**
 * The check pass, step 1: q9-2's request with token logprobs recorded (results.json keeps them per
 * request). Nothing changes in the answer; the run shows whether the words the models invent
 * ("flexible", "leather", "solar") come out less sure than the words they get right.
 */
const build = requestFrom({ ...SHIPPED, noImage: NAMES_ONLY })

const version: PromptVersion = {
  id: 'lp-1',
  notes: 'q9-2 (shipped + names-only rules) with logprobs and top 5 alternatives per token.',
  buildRequest: (input, imageUrl) => ({ ...build(input, imageUrl), logprobs: true, top_logprobs: 5 }),
  parseResult
}

export default version
