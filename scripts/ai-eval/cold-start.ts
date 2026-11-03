/**
 * Cold start, as the app meets it after launch, after five idle minutes or after a model switch: a
 * fresh llama-server (or Swift helper) and the app's own provider, timed from the first request to
 * the model being ready and to the first answer. Each trial asks a different cover and stops the
 * runtime after; compare a trial's first answer with that cover's time in a warm run (`time-all`).
 * Writes run.ts's log lines, so the eval progress view shows it.
 *
 *   pnpm exec tsx --tsconfig tsconfig.node.json scripts/ai-eval/cold-start.ts --model qwen3.5-9b [--trials 3]
 */
import { join } from 'node:path'
import { AppleInferenceProvider } from '../../src/main/ai/apple-provider'
import { LlamaServer, defaultLlamaServerDeps } from '../../src/main/ai/llama-server'
import { promptProfile } from '../../src/main/ai/prompts'
import { resolveLlamaServerPath, serverArgsFor } from '../../src/main/ai/provider-factory'
import { MODEL_FILE_NAMES } from '../../src/main/ai/registry'
import { VisionInferenceProvider, readCoverAsDataUrl } from '../../src/main/ai/vision-provider'
import { NativeHelper, resolveHelperPath } from '../../src/main/native/helper'
import type { AnalysisInput } from '../../src/shared/inference'
import { DEV_DIR, argValue, readItems, runDir, writeJson } from './eval-files'

interface Trial {
  id: string
  /** From the first request to llama-server's /health saying ready. Null for Apple's helper. */
  readyMs: number | null
  firstAnswerMs: number
  error?: string
}

async function main(): Promise<void> {
  const model = argValue('model')
  const trials = Number(argValue('trials') ?? '3')
  if (!model) throw new Error('Usage: cold-start.ts --model <id> [--trials n]')
  const profile = promptProfile(model)
  if (!profile) throw new Error(`No app prompt profile for ${model}`)
  const items = readItems().filter((i) => !i.duplicateOf).slice(0, trials)
  console.log(`${model} · cold-start · ${items.length} items × 1\n`)

  const results: Trial[] = []
  for (const item of items) {
    const input: AnalysisInput = { imagePath: item.coverPath, fileName: item.fileName, folderTrail: item.folderTrail }
    let ready: number | null = null
    let stop: () => Promise<void>
    let analyze: (input: AnalysisInput) => Promise<unknown>
    if (model === 'apple') {
      const helper = new NativeHelper({ binaryPath: resolveHelperPath() })
      analyze = (i) => new AppleInferenceProvider({ prompt: profile, helper }).analyze(i)
      stop = () => helper.stop()
    } else {
      const dir = join(DEV_DIR, 'models', model)
      const binaryPath = resolveLlamaServerPath(process.env, undefined)
      if (!binaryPath) throw new Error('No llama-server; run `node scripts/fetch-llama-server.mjs`.')
      const server = new LlamaServer(
        { binaryPath, modelPath: join(dir, MODEL_FILE_NAMES.model), mmprojPath: join(dir, MODEL_FILE_NAMES.mmproj), extraArgs: serverArgsFor(model) },
        {
          ...defaultLlamaServerDeps,
          fetch: async (url, init) => {
            const res = await defaultLlamaServerDeps.fetch(url, init)
            if (ready === null && String(url).endsWith('/health') && res.ok) ready = performance.now()
            return res
          }
        }
      )
      const provider = new VisionInferenceProvider(model, {
        prompt: profile,
        complete: async (request) => {
          const choice = (await server.complete(request)).choices?.[0]
          const text = choice?.message?.content
          if (typeof text !== 'string') throw new Error('llama-server reply has no message content')
          return { text, logprobs: choice?.logprobs }
        },
        readImage: readCoverAsDataUrl
      })
      analyze = (i) => provider.analyze(i)
      stop = () => server.stop()
    }

    const started = performance.now()
    const trial: Trial = { id: item.id, readyMs: null, firstAnswerMs: 0 }
    try {
      await analyze(input)
    } catch (err) {
      trial.error = err instanceof Error ? err.message : String(err)
    }
    trial.firstAnswerMs = Math.round(performance.now() - started)
    const readyAt: number | null = ready
    if (readyAt !== null) trial.readyMs = Math.round(readyAt - started)
    await stop()
    results.push(trial)
    const note = trial.error ? `FAILED ${trial.error.slice(0, 100)}` : trial.readyMs === null ? 'first answer' : `ready after ${trial.readyMs}ms`
    console.log(`${String(trial.firstAnswerMs).padStart(6)}ms  ${item.id}  ${note}`)
    await new Promise((r) => setTimeout(r, 2_000))
  }
  const path = join(runDir(model, 'cold-start'), 'results.json')
  writeJson(path, { model, at: new Date().toISOString(), trials: results })
  console.log(`\nWrote ${path}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
