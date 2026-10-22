import { NativeHelper, resolveHelperPath } from '../../../src/main/native/helper'
import { readCoverAsDataUrl } from '../../../src/main/ai/vision-provider'
import type { ChatContentPart, ChatRequest } from '../../../src/main/ai/vision-provider'
import type { AnalyzeContext, EvalResult, PromptVersion } from './prompt-version'

/**
 * Runs a prompt version on Apple's on-device model through the app's own Swift helper
 * (`pnpm helper:build`), with guided generation from the request's JSON schema, the way the app's
 * Apple provider does. Not a version itself: `ap-*.ts` files wrap their request and parser with it.
 */
let helper: NativeHelper | null = null

function useHelper(): NativeHelper {
  // A short idle stop, so the harness exits once the last answer is in.
  helper ??= new NativeHelper({ binaryPath: resolveHelperPath(), idleMs: 3_000 })
  return helper
}

/** The schema without `pattern`s, which the on-device model rejects (native/designstash-helper/README.md). */
function withoutPatterns(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutPatterns)
  if (!schema || typeof schema !== 'object') return schema
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key, value]) => !(key === 'pattern' && typeof value === 'string'))
      .map(([key, value]) => [key, withoutPatterns(value)])
  )
}

export function appleVersion(version: {
  id: string
  notes: string
  buildRequest(input: AnalyzeContext['input'], imageUrl: string | null): ChatRequest
  parseResult(raw: string): EvalResult
}): PromptVersion {
  return {
    ...version,
    runtime: 'external',
    readImage: readCoverAsDataUrl,
    async analyze(ctx: AnalyzeContext) {
      const hasImage = ctx.imageUrl !== null
      const request = version.buildRequest(ctx.input, hasImage ? ctx.input.imagePath : null)
      const system = request.messages.find((m) => m.role === 'system')!.content as string
      const user = request.messages.find((m) => m.role === 'user')!.content as ChatContentPart[]
      const t0 = Date.now()
      const reply = await useHelper().describe({
        imagePath: hasImage ? ctx.input.imagePath : null,
        instructions: system,
        prompt: user.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n'),
        schema: withoutPatterns(request.response_format.json_schema.schema) as object,
        maxTokens: request.max_tokens
      })
      return { ...version.parseResult(reply.text), extra: { ms: Date.now() - t0 } }
    }
  }
}
