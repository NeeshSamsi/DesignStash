import type { AnalysisInput, InferenceProvider, InferenceResult } from '../../shared/inference'
import type { DescribeRequest, NativeHelper } from '../native/helper'
import {
  buildRequest,
  parseResult,
  readCoverAsDataUrl,
  type ChatContentPart
} from './vision-provider'

export interface AppleProviderDeps {
  helper: Pick<NativeHelper, 'describe'>
  /**
   * Whether the cover is worth showing the model. Defaults to the vision provider's own test (a
   * missing, unreadable or near-blank placeholder cover is not), so both describe the same covers
   * from their names alone.
   */
  hasUsableCover?(path: string): Promise<boolean>
}

/**
 * A schema copy without `pattern`s. The on-device model rejects every regex guide (macOS 27.2,
 * native/designstash-helper/README.md); the patterns only keep llama replies to plain ASCII, and
 * `parseResult` tidies the reply either way.
 */
export function withoutPatterns(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutPatterns)
  if (!schema || typeof schema !== 'object') return schema
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key, value]) => !(key === 'pattern' && typeof value === 'string'))
      .map(([key, value]) => [key, withoutPatterns(value)])
  )
}

/** The vision request's prompt, instructions, schema and reply cap, as a helper `describe`. */
export function appleDescribeRequest(
  input: AnalysisInput,
  hasImage: boolean
): Omit<DescribeRequest, 'imagePath'> {
  // The image part of the chat request is left out: the helper attaches the cover itself.
  const request = buildRequest(input, hasImage ? input.imagePath : null)
  const [system, user] = request.messages
  const prompt = (user!.content as ChatContentPart[])
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n')
  return {
    instructions: system!.content as string,
    prompt,
    schema: withoutPatterns(request.response_format.json_schema.schema) as object,
    maxTokens: request.max_tokens
  }
}

/**
 * Inference over Apple's on-device model (Foundation Models, macOS 27, Apple Intelligence on),
 * through the Swift helper's `describe`: the same prompt and parsing as `VisionInferenceProvider`,
 * the cover attached as a file, a placeholder cover sent as names only. Not registered in the
 * catalogue or the provider factory; the AI bake-off decides whether and how it ships.
 */
export class AppleInferenceProvider implements InferenceProvider {
  readonly id = 'apple'
  readonly name = "Apple's on-device model"

  constructor(private readonly deps: AppleProviderDeps) {}

  async analyze(input: AnalysisInput): Promise<InferenceResult> {
    const usable = await (this.deps.hasUsableCover ?? hasUsableCover)(input.imagePath)
    const reply = await this.deps.helper.describe({
      imagePath: usable ? input.imagePath : null,
      ...appleDescribeRequest(input, usable)
    })
    return parseResult(reply.text)
  }
}

async function hasUsableCover(path: string): Promise<boolean> {
  return (await readCoverAsDataUrl(path)) !== null
}
