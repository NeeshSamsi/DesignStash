import { parseResult } from '../../../src/main/ai/vision-provider'
import type { PromptVersion } from './prompt-version'
import q41 from './q4-1'

/**
 * Qwen3-VL 4B, one change from q4-1: the sampling Qwen recommends for its VL models (temperature
 * 0.7, top_p 0.8, top_k 20, presence_penalty 1.5, no repeat penalty; design/research/vlm-models.md),
 * to see whether our low temperature, chosen on Qwen 2.5, still suits this model.
 */
const base = q41.buildRequest

const version: PromptVersion = {
  id: 'q4-3',
  notes: "q4-1 with Qwen's recommended VL sampling instead of temperature 0.2.",
  buildRequest(input, imageUrl) {
    const request = base(input, imageUrl) as Record<string, unknown>
    delete request.repeat_penalty
    return { ...request, temperature: 0.7, top_p: 0.8, top_k: 20, presence_penalty: 1.5 }
  },
  parseResult
}

export default version
