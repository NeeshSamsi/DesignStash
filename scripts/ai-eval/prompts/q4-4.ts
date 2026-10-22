import type { PromptVersion } from './prompt-version'
import { q41Spec } from './q4-1'
import q43 from './q4-3'
import { NAMES_ONLY, requestFrom } from './tunable'

/** Qwen3-VL 4B: q4-3 plus the names-only rules for a placeholder cover. */
const build = requestFrom({ ...q41Spec, noImage: NAMES_ONLY })

const version: PromptVersion = {
  id: 'q4-4',
  notes: 'q4-3 (q4-1 prompt, Qwen sampling) plus names-only description and tag rules.',
  buildRequest(input, imageUrl) {
    const request = build(input, imageUrl) as unknown as Record<string, unknown>
    delete request.repeat_penalty
    return { ...request, temperature: 0.7, top_p: 0.8, top_k: 20, presence_penalty: 1.5 }
  },
  parseResult: q43.parseResult
}

export default version
