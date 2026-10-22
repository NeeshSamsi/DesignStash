import type { AnalysisInput, InferenceResult } from '../../../shared/inference'
import type { ChatRequest } from '../vision-provider'

/**
 * How one model is asked about a mockup and how its reply is read. Each model in the catalogue
 * names its own profile (`ModelEntry.prompt`), so a prompt tuned for one model never changes
 * another's. Apple's model gets the same request through the helper (`appleDescribeRequest`).
 */
export interface PromptProfile {
  /** The chat request for one mockup; `imageUrl` is null when it goes by its names alone. */
  buildRequest(input: AnalysisInput, imageUrl: string | null): ChatRequest
  /** The model's reply as a suggestion, tidied; throws when the reply can't be read. */
  parseResult(text: string): InferenceResult
  /**
   * Things the model tends to add to a scene (`SCENE_THINGS`). After an answer about a cover, each one
   * it mentions is asked about as a yes/no question on the same image, and a "no" takes it out
   * (`scene-check.ts`). Left out, nothing is checked.
   */
  sceneThings?: readonly string[]
}
