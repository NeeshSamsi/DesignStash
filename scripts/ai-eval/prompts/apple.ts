import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { buildRequest, parseResult } from '../../../src/main/ai/vision-provider'
import type { ChatContentPart } from '../../../src/main/ai/vision-provider'
import type { AnalyzeContext, PromptVersion } from './prompt-version'

/**
 * Apple's on-device model (Foundation Models, image input from macOS 27, Apple Intelligence on),
 * asked the shipped prompt through the `tmp/ai-eval-fm` bridge (`scripts/ai-eval/apple/fm.swift`).
 * It has no grammar, so the JSON shape the llama.cpp schema enforces is spelled out instead, and the
 * reply goes through the app's own `parseResult`. A placeholder cover goes as names only, as it does
 * for the llama models.
 */
const BRIDGE = join(process.cwd(), 'tmp', 'ai-eval-fm')

const SHAPE =
  'Reply with one JSON object and nothing else, in exactly this shape: {"title": "...", "description": "...", "tags": [{"category": "Device", "label": "..."}]}. The category is one of the category names listed above.'

let bridge: Promise<(request: object) => Promise<{ text?: string; error?: string; ms?: number }>> | null = null

function start(): Promise<(request: object) => Promise<{ text?: string; error?: string; ms?: number }>> {
  if (!existsSync(BRIDGE)) {
    throw new Error('No Foundation Models bridge: swiftc -O -parse-as-library -o tmp/ai-eval-fm scripts/ai-eval/apple/fm.swift')
  }
  const child: ChildProcessWithoutNullStreams = spawn(BRIDGE, [], { stdio: 'pipe' })
  const lines = createInterface({ input: child.stdout })
  const waiting: ((line: string) => void)[] = []
  lines.on('line', (line) => waiting.shift()?.(line))
  // The open pipes would keep the harness running after the last answer, so the bridge stops itself
  // after a few idle seconds; the next request starts a new one.
  let idle: NodeJS.Timeout | undefined
  const stopLater = () => {
    clearTimeout(idle)
    idle = setTimeout(() => {
      bridge = null
      child.stdin.end()
      child.kill()
    }, 3000)
  }
  const next = () =>
    new Promise<string>((resolve) => {
      clearTimeout(idle)
      waiting.push((line) => {
        stopLater()
        resolve(line)
      })
    })
  return next().then((first) => {
    const ready = JSON.parse(first) as { ready?: boolean; error?: string }
    if (!ready.ready) throw new Error(`Foundation Models unavailable: ${ready.error ?? first}`)
    let queue = Promise.resolve()
    return (request: object) => {
      const answer = queue.then(async () => {
        child.stdin.write(`${JSON.stringify(request)}\n`)
        return JSON.parse(await next()) as { text?: string; error?: string; ms?: number }
      })
      queue = answer.then(() => undefined, () => undefined)
      return answer
    }
  })
}

const apple: PromptVersion = {
  id: 'apple',
  notes: "Apple's on-device model (macOS 27) with the shipped prompt, the JSON shape spelled out, and the app's parseResult.",
  runtime: 'external',
  buildRequest,
  parseResult,
  async analyze(ctx: AnalyzeContext) {
    bridge ??= start()
    const send = await bridge
    const request = buildRequest(ctx.input, ctx.imageUrl)
    const system = request.messages.find((m) => m.role === 'system')!.content as string
    const user = request.messages.find((m) => m.role === 'user')!.content as ChatContentPart[]
    const text = user.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')
    const reply = await send({
      image: ctx.imageUrl ? ctx.input.imagePath : null,
      instructions: system,
      prompt: `${text}\n\n${SHAPE}`
    })
    if (reply.error || !reply.text) throw new Error(reply.error ?? 'empty reply')
    const result = parseResult(reply.text)
    return { ...result, extra: { ms: reply.ms } }
  }
}

export default apple
