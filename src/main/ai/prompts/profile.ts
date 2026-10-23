import type { AnalysisInput, InferenceResult } from '../../../shared/inference'
import type { MaskFill } from '../masked-cover'
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
  /**
   * How the design slot is painted over in the cover the model answers from (`masked-cover.ts`), so
   * it never describes the placeholder. The scene check then looks at the cover as it is. Left out,
   * the model sees the cover as it is.
   */
  mask?: MaskFill
  /**
   * When the scene check refuses a thing, ask for the answer once more, told the image has none of
   * them (`refusedNote`); the refused things are still taken out of the new answer. For a thing that
   * is the object's own name ("a white cube lamp"), which taking a phrase out can't mend.
   */
  redo?: boolean
}
