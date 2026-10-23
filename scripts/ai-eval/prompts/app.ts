import { AppleInferenceProvider } from '../../../src/main/ai/apple-provider'
import { promptProfile } from '../../../src/main/ai/prompts'
import { VisionInferenceProvider, readCoverAsDataUrl } from '../../../src/main/ai/vision-provider'
import { NativeHelper, resolveHelperPath } from '../../../src/main/native/helper'
import { argValue } from '../eval-files'
import type { AnalyzeContext, AnalyzeVersion } from './prompt-version'

/**
 * The app itself: the `--model`'s own prompt profile (`src/main/ai/prompts/`) through the app's own
 * provider, so a run scores exactly what ships (masked cover, scene check, redo and all). The masked
 * cover is written beside the eval's cover from its `slot-mask.png`, as the app does beside a
 * mockup's. For Apple, `--model apple`; the helper is the app's.
 */
const model = argValue('model') ?? ''
const profile = promptProfile(model)
let helper: NativeHelper | null = null

const version: AnalyzeVersion = {
  id: 'app',
  notes: `The app's own provider and the ${model} prompt profile.`,
  ...(model === 'apple' && { runtime: 'external' as const }),
  async analyze(ctx: AnalyzeContext) {
    if (!profile) throw new Error(`No app prompt profile for ${model}`)
    if (model === 'apple') {
      helper ??= new NativeHelper({ binaryPath: resolveHelperPath(), idleMs: 3_000 })
      return new AppleInferenceProvider({ prompt: profile, helper }).analyze(ctx.input)
    }
    const provider = new VisionInferenceProvider(model, {
      prompt: profile,
      complete: async (request) => {
        const reply = await ctx.chat(request)
        return { text: reply.raw, logprobs: reply.logprobs }
      },
      readImage: readCoverAsDataUrl
    })
    return provider.analyze(ctx.input)
  }
}

export default version
