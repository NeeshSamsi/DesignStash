import { buildRequest, parseResult } from '../../../src/main/ai/vision-provider'
import type { PromptVersion } from './prompt-version'

/** The baseline: the app's prompt and parser as they are, unchanged. */
const v0: PromptVersion = {
  id: 'v0',
  notes: "The app's current buildRequest and parseResult from src/main/ai/vision-provider.ts.",
  buildRequest,
  parseResult
}

export default v0
