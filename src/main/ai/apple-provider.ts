import type { AnalysisInput, InferenceProvider, InferenceResult, PileEdit, PileEditEntry, PileEditSteps } from '../../shared/inference'
import { HelperError, type DescribeRequest, type NativeHelper } from '../native/helper'
import { ModelUnavailableError } from './model-unavailable'
import type { PromptProfile } from './prompts/profile'
import { maskedCoverPath, type MaskFill } from './masked-cover'
import { ENTRY_SCHEMA, PILE_EDIT_SYSTEM, readRewrite, rewritePrompt } from './pile-edit'
import { withoutObjectColours } from './object-colour'
import { mentionedThings, refusedNote, sceneQuestion, withoutThing } from './scene-check'
import { readCoverAsDataUrl, type ChatContentPart } from './vision-provider'

export interface AppleProviderDeps {
  /** The model's own prompt (prompts/apple.ts), converted for the helper by `appleDescribeRequest`. */
  prompt: PromptProfile
  /** `stop` ends a run that hit the hard stop; the helper starts again on the next request. */
  helper: Pick<NativeHelper, 'describe'> & Partial<Pick<NativeHelper, 'stop'>>
  /**
   * Whether the cover is worth showing the model. Defaults to the vision provider's own test (a
   * missing, unreadable or near-blank placeholder cover is not), so both describe the same covers
   * from their names alone.
   */
  hasUsableCover?(path: string): Promise<boolean>
  /** The cover with its design slot painted over, or null without a mask. Default `maskedCoverPath`. */
  maskedCover?(coverPath: string, fill: MaskFill): Promise<string | null>
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
 * a placeholder cover sent as names only, then the scene-thing check on the cover
 * (`scene-check.ts`). The provider factory builds it for the catalogue's `apple` entry.
 */
export class AppleInferenceProvider implements InferenceProvider {
  readonly id = 'apple'
  readonly name = "Apple's on-device model"
  /** Apple judges no pile edits (round 3 C); accepting one rewrites, unless the profile copies. */
  readonly pileEdits: PileEditSteps

  constructor(private readonly deps: AppleProviderDeps) {
    this.pileEdits = deps.prompt.pileEdits?.copy ? {} : { rewrite: (edit, entry) => this.rewriteForEdit(edit, entry) }
  }

  /** The variant's description with the edit's change worked in, from the text alone. */
  private async rewriteForEdit(edit: PileEdit, entry: PileEditEntry): Promise<string> {
    const prompt = rewritePrompt(edit, entry)
    if (prompt === null) return entry.description
    const reply = await this.deps.helper.describe({ imagePath: null, instructions: PILE_EDIT_SYSTEM, prompt, schema: ENTRY_SCHEMA, maxTokens: 400 })
    return readRewrite(reply.text)
  }

  /** Stop the helper mid-run (the hard stop). It starts again on the next request. */
  async stop(): Promise<void> {
    await this.deps.helper.stop?.()
  }

  /** The suggestion, with the object's colours taken out last, after the check (round 4). */
  async analyze(input: AnalysisInput): Promise<InferenceResult> {
    return withoutObjectColours(await this.answer(input))
  }

  private async answer(input: AnalysisInput): Promise<InferenceResult> {
    const { prompt } = this.deps
    const usable = await (this.deps.hasUsableCover ?? hasUsableCover)(input.imagePath)
    const masked = usable && prompt.mask ? await (this.deps.maskedCover ?? maskedCoverPath)(input.imagePath, prompt.mask) : null
    const asked = masked ? { ...input, slotMasked: true } : input
    const request = { imagePath: usable ? (masked ?? input.imagePath) : null, ...appleDescribeRequest(asked, usable, prompt) }
    const reply = await this.deps.helper.describe(request).catch((err: unknown) => {
      // Apple Intelligence switched off while the app runs: the model can't run, whatever the mockup (H-1).
      throw err instanceof HelperError && err.code === 'unavailable' ? new ModelUnavailableError(err.message) : err
    })
    let answer = prompt.parseResult(reply.text)
    if (!usable) return answer
    // The check looks at the cover as it is, so a thing read into the painted slot is checked against the real scene.
    const refused: string[] = []
    for (const thing of mentionedThings(answer, prompt.sceneThings ?? [])) {
      if ((await this.check(input.imagePath, thing)) === 'no') refused.push(thing)
    }
    if (prompt.redo && refused.length > 0) {
      answer = await this.deps.helper
        .describe({ ...request, prompt: `${request.prompt}\n\n${refusedNote(refused)}` })
        .then((reply) => prompt.parseResult(reply.text))
        .catch(() => answer)
    }
    for (const thing of refused) answer = withoutThing(answer, thing)
    return answer
  }

  /**
   * One scene-thing question on the cover. Apple's model gives no logprobs, so the answer is its
   * greedy yes or no, held to those by the schema. Null when the check fails.
   */
  private async check(imagePath: string, thing: string): Promise<'yes' | 'no' | null> {
    try {
      const reply = await this.deps.helper.describe({
        imagePath,
        instructions: 'You answer questions about one image, looking only at the image.',
        prompt: sceneQuestion(thing),
        schema: YES_NO_SCHEMA,
        maxTokens: 10
      })
      const said = (JSON.parse(reply.text) as { answer?: unknown }).answer
      return said === 'yes' || said === 'no' ? said : null
    } catch {
      return null
    }
  }
}

const YES_NO_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string', enum: ['yes', 'no'] } },
  required: ['answer']
}

async function hasUsableCover(path: string): Promise<boolean> {
  return (await readCoverAsDataUrl(path)) !== null
}
