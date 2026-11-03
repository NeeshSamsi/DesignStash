import { buildRequest, parseResult, readCoverAsDataUrl } from '../../../src/main/ai/vision-provider'
import type { PromptVersion } from './prompt-version'

/** What the app ships: its own prompt, cover reader and parser, unchanged. Rerun this after any change to them. */
const shipped: PromptVersion = {
  id: 'shipped',
  notes: "The app's buildRequest, parseResult and readCoverAsDataUrl from src/main/ai/vision-provider.ts, as shipped.",
  readImage: readCoverAsDataUrl,
  buildRequest,
  parseResult
}

export default shipped
