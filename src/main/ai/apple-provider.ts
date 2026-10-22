import type { AnalysisInput, InferenceProvider, InferenceResult } from '../../shared/inference'
import type { DescribeRequest, NativeHelper } from '../native/helper'
import type { PromptProfile } from './prompts/profile'
import { readCoverAsDataUrl, type ChatContentPart } from './vision-provider'

export interface AppleProviderDeps {
  /** The model's own prompt (prompts/apple.ts), converted for the helper by `appleDescribeRequest`. */
  prompt: PromptProfile
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

/**
 * A profile's chat request as a helper `describe`: its instructions, prompt, schema and reply cap.
 * The sampling settings are dropped, because the helper decodes greedily.
 */
export function appleDescribeRequest(
  input: AnalysisInput,
  hasImage: boolean,
  profile: PromptProfile
): Omit<DescribeRequest, 'imagePath'> {
  // The image part of the chat request is left out: the helper attaches the cover itself.
  const request = profile.buildRequest(input, hasImage ? input.imagePath : null)
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
 * through the Swift helper's `describe`: the model's prompt profile, the cover attached as a file,
 * a placeholder cover sent as names only. The provider factory builds it for the catalogue's
 * `apple` entry.
 */
export class AppleInferenceProvider implements InferenceProvider {
  readonly id = 'apple'
  readonly name = "Apple's on-device model"

  constructor(private readonly deps: AppleProviderDeps) {}

  async analyze(input: AnalysisInput): Promise<InferenceResult> {
    const usable = await (this.deps.hasUsableCover ?? hasUsableCover)(input.imagePath)
    const reply = await this.deps.helper.describe({
      imagePath: usable ? input.imagePath : null,
      ...appleDescribeRequest(input, usable, this.deps.prompt)
    })
    return this.deps.prompt.parseResult(reply.text)
  }
}

async function hasUsableCover(path: string): Promise<boolean> {
  return (await readCoverAsDataUrl(path)) !== null
}
