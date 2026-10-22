import { NativeHelper, resolveHelperPath } from '../../../src/main/native/helper'
import { mentioned, withoutThing } from './ck-2'
import type { AnalyzeContext, PromptVersion } from './prompt-version'
import ap5 from './ap-5'

/**
 * Apple: ap-5 (ap-3's names rule plus the names-only rule) and ck-2's scene-thing check. Apple's
 * model gives no logprobs, so each check is one greedy yes/no answer shaped by a schema enum, and a
 * "no" removes the thing.
 */
let helper: NativeHelper | null = null
const sharedHelper = () => (helper ??= new NativeHelper({ binaryPath: resolveHelperPath(), idleMs: 3_000 }))

const version: PromptVersion = {
  ...ap5,
  id: 'ap-6',
  notes: 'ap-5 plus a yes/no check (schema enum) on scene things; a "no" removes it.',
  async analyze(ctx: AnalyzeContext) {
    let answer = await ap5.analyze!(ctx)
    if (!ctx.imageUrl) return answer
    const checks: Record<string, string> = {}
    for (const thing of mentioned(answer)) {
      const reply = await sharedHelper().describe({
        imagePath: ctx.input.imagePath,
        instructions: 'You answer questions about one image, looking only at the image.',
        prompt: `Is there ${/^[aeiou]/.test(thing) ? 'an' : 'a'} ${thing} in this image? Answer yes or no.`,
        schema: { type: 'object', properties: { answer: { type: 'string', enum: ['yes', 'no'] } }, required: ['answer'] },
        maxTokens: 10
      })
      const said = (JSON.parse(reply.text) as { answer: string }).answer
      checks[thing] = said
      if (said === 'no') answer = withoutThing(answer, thing)
    }
    return { ...answer, extra: { ...answer.extra, checks } }
  }
}

export default version
