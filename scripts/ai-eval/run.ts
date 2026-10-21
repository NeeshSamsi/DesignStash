/**
 * ai-eval:run. Asks a local vision model about every unique item in items.json with one prompt
 * version, the way the app does: one llama-server with the app's flags, the cover read by
 * `readCoverAsDataUrl`, the file name and folders from items.json. Records the raw reply, the
 * parsed result and the tags as the app would save them (after `snapTags`).
 *
 *   pnpm ai-eval:run --model qwen2.5-vl-3b --prompt v0
 *   pnpm ai-eval:run --model qwen2.5-vl-7b --prompt v1 --only tape-mockup,free-cap-mockup
 *   pnpm ai-eval:run --model qwen2.5-vl-3b --prompt v0 --repeat 3
 *
 * Writes runs/<model>/<prompt>/results.json and run.json under the eval folder. With `--only`,
 * those items replace their earlier results and the rest are kept.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LlamaServer, defaultLlamaServerDeps } from '../../src/main/ai/llama-server'
import { MODEL_SERVER_ARGS, resolveLlamaServerPath } from '../../src/main/ai/provider-factory'
import { MODEL_FILE_NAMES } from '../../src/main/ai/registry'
import { readCoverAsDataUrl } from '../../src/main/ai/vision-provider'
import type { AnalysisInput } from '../../src/shared/inference'
import { DEV_DIR, argValue, readItems, runDir, writeJson } from './eval-files'
import type { EvalResult, PromptVersion } from './prompts/prompt-version'
import { createTagSnapper, type TagPair } from './searchable-tags'

/** Added to every request here, never in the app, so reruns of the same prompt are comparable. */
export const EVAL_SEED = 42

export interface ItemResult {
  id: string
  /** 0 for the first pass, 1… with `--repeat`. */
  repeat: number
  input: Omit<AnalysisInput, 'imagePath'> & { hasImage: boolean }
  raw: string | null
  parsed: EvalResult | null
  /** The tags as the app saves them: snapped to the library's labels, repeats dropped. */
  searchTags: TagPair[]
  error?: string
  elapsedMs: number
  promptTokens?: number
  completionTokens?: number
  timings?: Record<string, number>
}

export interface RunInfo {
  model: string
  prompt: string
  notes: string
  seed: number
  binaryPath: string
  startedAt: string
  endedAt: string
  repeats: number
  only: string[] | null
  items: number
  failures: number
  avgMs: number
  promptTokens: number
  completionTokens: number
}

interface ChatUsage {
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  timings?: Record<string, number>
}

async function loadPrompt(version: string): Promise<PromptVersion> {
  const path = join(import.meta.dirname, 'prompts', `${version}.ts`)
  if (!existsSync(path)) throw new Error(`No prompt version at ${path}`)
  const mod = (await import(pathToFileURL(path).href)) as { default: PromptVersion }
  return mod.default
}

async function main(): Promise<void> {
  const model = argValue('model')
  const version = argValue('prompt')
  if (!model || !version) {
    throw new Error(
      'Usage: pnpm ai-eval:run --model <id> --prompt <version> [--only id,id] [--repeat n]'
    )
  }
  const only = argValue('only')?.split(',').filter(Boolean) ?? null
  const repeats = Number(argValue('repeat') ?? '1')
  if (!Number.isInteger(repeats) || repeats < 1)
    throw new Error('--repeat takes a whole number, 1 or more')

  const prompt = await loadPrompt(version)
  const all = readItems().filter((i) => !i.duplicateOf)
  const unknown = only?.filter((id) => !all.some((i) => i.id === id)) ?? []
  if (unknown.length > 0) throw new Error(`Not in items.json: ${unknown.join(', ')}`)
  const items = only ? all.filter((i) => only.includes(i.id)) : all

  // The same files and flags the provider factory gives the app.
  const modelDir = join(DEV_DIR, 'models', model)
  const modelPath = join(modelDir, MODEL_FILE_NAMES.model)
  const mmprojPath = join(modelDir, MODEL_FILE_NAMES.mmproj)
  if (!existsSync(modelPath) || !existsSync(mmprojPath))
    throw new Error(`No model files in ${modelDir}`)
  const binaryPath = resolveLlamaServerPath(process.env, undefined)
  if (!binaryPath) throw new Error('No llama-server; run `node scripts/fetch-llama-server.mjs`.')

  // The server returns only the reply text; this keeps the token counts and timings beside it.
  let lastUsage: ChatUsage
  const server = new LlamaServer(
    { binaryPath, modelPath, mmprojPath, extraArgs: MODEL_SERVER_ARGS[model] ?? [] },
    {
      ...defaultLlamaServerDeps,
      fetch: async (url, init) => {
        const res = await globalThis.fetch(url, init)
        if (String(url).endsWith('/v1/chat/completions') && res.ok) {
          lastUsage = (await res.clone().json()) as ChatUsage
        }
        return res
      }
    }
  )

  const startedAt = new Date().toISOString()
  const results: ItemResult[] = []
  console.log(`${model} · ${prompt.id} · ${items.length} items × ${repeats}\n`)
  try {
    for (let repeat = 0; repeat < repeats; repeat++) {
      // One library per pass: labels a pass invents are what its later items snap to.
      const snap = createTagSnapper()
      for (const item of items) {
        const input: AnalysisInput = {
          imagePath: item.coverPath,
          fileName: item.fileName,
          folderTrail: item.folderTrail
        }
        const imageUrl = await readCoverAsDataUrl(input.imagePath)
        const result: ItemResult = {
          id: item.id,
          repeat,
          input: {
            fileName: input.fileName,
            folderTrail: input.folderTrail,
            hasImage: imageUrl !== null
          },
          raw: null,
          parsed: null,
          searchTags: [],
          elapsedMs: 0
        }
        const started = performance.now()
        try {
          lastUsage = {}
          result.raw = await server.chat({
            ...prompt.buildRequest(input, imageUrl),
            seed: EVAL_SEED
          })
          result.elapsedMs = Math.round(performance.now() - started)
          if (lastUsage.usage?.prompt_tokens !== undefined)
            result.promptTokens = lastUsage.usage.prompt_tokens
          if (lastUsage.usage?.completion_tokens !== undefined)
            result.completionTokens = lastUsage.usage.completion_tokens
          if (lastUsage.timings) result.timings = lastUsage.timings
          result.parsed = prompt.parseResult(result.raw)
          result.searchTags = await snap(result.parsed.tags)
        } catch (err) {
          result.elapsedMs ||= Math.round(performance.now() - started)
          result.error = err instanceof Error ? err.message : String(err)
        }
        results.push(result)
        const line = result.error ? `FAILED ${result.error.slice(0, 100)}` : result.parsed!.title
        console.log(`${String(result.elapsedMs).padStart(6)}ms  ${item.id}  ${line}`)
      }
    }
  } finally {
    await server.stop()
  }

  const dir = runDir(model, prompt.id)
  const resultsPath = join(dir, 'results.json')
  let saved = results
  if (only && existsSync(resultsPath)) {
    const earlier = JSON.parse(readFileSync(resultsPath, 'utf8')) as ItemResult[]
    saved = [...earlier.filter((r) => !only.includes(r.id)), ...results]
  }
  writeJson(resultsPath, saved)

  const failures = results.filter((r) => r.error).length
  const sum = (pick: (r: ItemResult) => number | undefined) =>
    results.reduce((total, r) => total + (pick(r) ?? 0), 0)
  const info: RunInfo = {
    model,
    prompt: prompt.id,
    notes: prompt.notes,
    seed: EVAL_SEED,
    binaryPath,
    startedAt,
    endedAt: new Date().toISOString(),
    repeats,
    only,
    items: items.length,
    failures,
    avgMs: Math.round(sum((r) => r.elapsedMs) / Math.max(results.length, 1)),
    promptTokens: sum((r) => r.promptTokens),
    completionTokens: sum((r) => r.completionTokens)
  }
  writeJson(join(dir, 'run.json'), info)
  console.log(
    `\n${results.length} answers, ${failures} failed, avg ${info.avgMs}ms. Wrote ${resultsPath}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
