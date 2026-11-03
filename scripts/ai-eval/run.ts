/**
 * ai-eval:run. Asks a local vision model about every unique item in items.json with one prompt
 * version, the way the app does: one llama-server with the app's flags, the cover read by
 * `readCoverAsDataUrl`, the file name and folders from items.json. Records the raw reply, the
 * parsed result and the tags as the app would save them (after `snapTags`).
 *
 *   pnpm ai-eval:run --model qwen2.5-vl-3b --prompt v0
 *   pnpm ai-eval:run --model qwen2.5-vl-7b --prompt v1 --only tape-mockup,free-cap-mockup
 *   pnpm ai-eval:run --model qwen2.5-vl-3b --prompt v0 --repeat 3 --seed-base 1000
 *   pnpm ai-eval:run --model qwen2.5-vl-3b --prompt v4 --dry
 *
 * A version with `analyze()` makes its own requests (or, with `runtime: 'external'`, none: no
 * llama-server is started). `DESIGNSTASH_EVAL_SERVER_ARGS` adds llama-server flags for an
 * experiment. `--dry` writes the request bodies a one-request version would send to
 * dry-requests.json, images cut to a hash, and starts nothing.
 *
 * Writes runs/<model>/<prompt>/results.json and run.json under the eval folder. With `--only`,
 * those items replace their earlier results and the rest are kept.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LlamaServer, defaultLlamaServerDeps } from '../../src/main/ai/llama-server'
import { MODEL_SERVER_ARGS, resolveLlamaServerPath } from '../../src/main/ai/provider-factory'
import { MODEL_FILE_NAMES } from '../../src/main/ai/registry'
import { readCoverAsDataUrl } from '../../src/main/ai/vision-provider'
import type { AnalysisInput } from '../../src/shared/inference'
import { COVERS_DIR, DEV_DIR, argValue, readItems, runDir, writeJson } from './eval-files'
import {
  analyzeRequestBody,
  checkVersion,
  parseRssKb,
  parseSeedBase,
  parseVersionString,
  redactDataUrls,
  requestRecord,
  serverArgsFromEnv,
  singleRequestBody,
  toChatReply,
  type RequestRecord
} from './harness'
import type { ChatReply, EvalResult, EvalVersion, PromptVersion } from './prompts/prompt-version'
import { createTagSnapper, type TagPair } from './searchable-tags'
import { readVision } from './vision-data'

export interface ItemResult {
  id: string
  /** 0 for the first pass, 1… with `--repeat`. */
  repeat: number
  input: Omit<AnalysisInput, 'imagePath'> & { hasImage: boolean }
  /** The reply text of a one-request version. Null for an `analyze` version: see `requests`. */
  raw: string | null
  parsed: EvalResult | null
  /** The tags as the app saves them: snapped to the library's labels, repeats dropped. */
  searchTags: TagPair[]
  error?: string
  elapsedMs: number
  /** Summed over every request. */
  promptTokens?: number
  completionTokens?: number
  /** The server's timings for a one-request version. */
  timings?: Record<string, number>
  requestCount?: number
  /** Every request made for this answer, in order. */
  requests?: RequestRecord[]
}

export interface RunInfo {
  model: string
  prompt: string
  notes: string
  runtime: 'llama' | 'external'
  /** `--seed-base`: pass n is sent seed + n. */
  seed: number
  binaryPath: string | null
  binaryVersion: string | null
  /** Every flag added to llama-server's defaults: the model's own, then `DESIGNSTASH_EVAL_SERVER_ARGS`. */
  serverArgs: string[]
  /** The ones from `DESIGNSTASH_EVAL_SERVER_ARGS`. */
  envServerArgs: string[]
  /** llama-server's resident memory in KB, after the first completed request and at the end. */
  serverRssKb: { afterFirstRequest: number | null; end: number | null }
  startedAt: string
  endedAt: string
  repeats: number
  only: string[] | null
  items: number
  failures: number
  avgMs: number
  requests: number
  promptTokens: number
  completionTokens: number
}

async function loadPrompt(version: string): Promise<EvalVersion> {
  const path = join(import.meta.dirname, 'prompts', `${version}.ts`)
  if (!existsSync(path)) throw new Error(`No prompt version at ${path}`)
  const mod = (await import(pathToFileURL(path).href)) as { default: Partial<EvalVersion> }
  checkVersion(mod.default)
  return mod.default
}

function binaryVersion(binaryPath: string): string | null {
  const out = spawnSync(binaryPath, ['--version'], { encoding: 'utf8', timeout: 10_000 })
  return parseVersionString(`${out.stdout ?? ''}\n${out.stderr ?? ''}`)
}

function rssKb(pid: number | undefined): number | null {
  if (pid === undefined) return null
  const out = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' })
  return parseRssKb(out.stdout ?? '')
}

async function main(): Promise<void> {
  const model = argValue('model')
  const version = argValue('prompt')
  if (!model || !version) {
    throw new Error(
      'Usage: pnpm ai-eval:run --model <id> --prompt <version> [--only id,id] [--repeat n] [--seed-base n] [--dry]'
    )
  }
  const only = argValue('only')?.split(',').filter(Boolean) ?? null
  const repeats = Number(argValue('repeat') ?? '1')
  if (!Number.isInteger(repeats) || repeats < 1)
    throw new Error('--repeat takes a whole number, 1 or more')
  const seedBase = parseSeedBase(argValue('seed-base'))
  const dry = process.argv.includes('--dry')

  const prompt = await loadPrompt(version)
  // A one-request version, or null when the version analyzes.
  const single = prompt.analyze ? null : (prompt as PromptVersion)
  const runtime = prompt.runtime ?? 'llama'
  const all = readItems().filter((i) => !i.duplicateOf)
  const unknown = only?.filter((id) => !all.some((i) => i.id === id)) ?? []
  if (unknown.length > 0) throw new Error(`Not in items.json: ${unknown.join(', ')}`)
  const items = only ? all.filter((i) => only.includes(i.id)) : all
  // Read up front, so a bad file stops the run before any model time is spent.
  const visions = new Map(items.map((i) => [i.id, readVision(COVERS_DIR, i.id)]))

  const inputFor = (item: (typeof items)[number]): AnalysisInput => ({
    imagePath: item.coverPath,
    fileName: item.fileName,
    folderTrail: item.folderTrail
  })
  const readImage = (path: string) => (prompt.readImage ?? readCoverAsDataUrl)(path)

  if (dry) {
    if (!single) throw new Error(`${prompt.id} analyzes; only a one-request version has a dry run`)
    const rows: { id: string; repeat: number; body: unknown }[] = []
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const item of items) {
        const input = inputFor(item)
        const body = singleRequestBody(
          single,
          input,
          await readImage(input.imagePath),
          seedBase + repeat
        )
        rows.push({ id: item.id, repeat, body: redactDataUrls(body) })
      }
    }
    const path = join(runDir(model, prompt.id), 'dry-requests.json')
    writeJson(path, rows)
    console.log(`${rows.length} request bodies. Wrote ${path}`)
    return
  }

  const envServerArgs = serverArgsFromEnv(process.env)
  const serverArgs = [...(MODEL_SERVER_ARGS[model] ?? []), ...envServerArgs]
  let binaryPath: string | null = null
  let server: LlamaServer | null = null
  let serverPid: number | undefined
  if (runtime === 'llama') {
    // The same files and flags the provider factory gives the app.
    const modelDir = join(DEV_DIR, 'models', model)
    const modelPath = join(modelDir, MODEL_FILE_NAMES.model)
    const mmprojPath = join(modelDir, MODEL_FILE_NAMES.mmproj)
    if (!existsSync(modelPath) || !existsSync(mmprojPath))
      throw new Error(`No model files in ${modelDir}`)
    binaryPath = resolveLlamaServerPath(process.env, undefined)
    if (!binaryPath) throw new Error('No llama-server; run `node scripts/fetch-llama-server.mjs`.')
    server = new LlamaServer(
      { binaryPath, modelPath, mmprojPath, extraArgs: serverArgs },
      {
        ...defaultLlamaServerDeps,
        spawn: (command, args) => {
          const child = defaultLlamaServerDeps.spawn(command, args)
          serverPid = child.pid
          return child
        }
      }
    )
  }
  const serverRssKb: RunInfo['serverRssKb'] = { afterFirstRequest: null, end: null }
  let firstRequestDone = false

  const startedAt = new Date().toISOString()
  const results: ItemResult[] = []
  console.log(`${model} · ${prompt.id} · ${items.length} items × ${repeats}\n`)
  try {
    for (let repeat = 0; repeat < repeats; repeat++) {
      // Pass 0 keeps the base seed, so a single pass reproduces earlier runs; later passes sample afresh.
      const seed = seedBase + repeat
      // One library per pass: labels a pass invents are what its later items snap to.
      const snap = createTagSnapper()
      for (const item of items) {
        const input = inputFor(item)
        const vision = visions.get(item.id)
        const imageUrl = await readImage(input.imagePath)
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
        const requests: RequestRecord[] = []
        const chat = async (body: object): Promise<ChatReply> => {
          if (!server)
            throw new Error(`${prompt.id} runs external: it has no llama-server to chat with`)
          const sent = performance.now()
          const json = await server.complete(body)
          const reply = toChatReply(json, Math.round(performance.now() - sent))
          requests.push(requestRecord(reply, body, !single))
          if (!firstRequestDone) {
            firstRequestDone = true
            serverRssKb.afterFirstRequest = rssKb(serverPid)
          }
          return reply
        }
        const started = performance.now()
        try {
          if (single) {
            const reply = await chat(singleRequestBody(single, input, imageUrl, seed))
            result.raw = reply.raw
            result.elapsedMs = Math.round(performance.now() - started)
            if (reply.timings) result.timings = reply.timings
            result.parsed = single.parseResult(reply.raw, { input, vision })
          } else {
            result.parsed = await prompt.analyze!({
              input,
              imageUrl,
              vision,
              repeat,
              seed,
              chat: (request) => chat(analyzeRequestBody(request, seed))
            })
            result.elapsedMs = Math.round(performance.now() - started)
          }
          result.searchTags = await snap(result.parsed.tags)
        } catch (err) {
          result.elapsedMs ||= Math.round(performance.now() - started)
          result.error = err instanceof Error ? err.message : String(err)
        }
        const tokens = (pick: (r: RequestRecord) => number | undefined) =>
          requests.some((r) => pick(r) !== undefined)
            ? requests.reduce((t, r) => t + (pick(r) ?? 0), 0)
            : undefined
        const promptTokens = tokens((r) => r.promptTokens)
        const completionTokens = tokens((r) => r.completionTokens)
        if (promptTokens !== undefined) result.promptTokens = promptTokens
        if (completionTokens !== undefined) result.completionTokens = completionTokens
        result.requestCount = requests.length
        result.requests = requests
        results.push(result)
        const line = result.error ? `FAILED ${result.error.slice(0, 100)}` : result.parsed!.title
        const count = single ? '' : `  (${requests.length} req)`
        console.log(`${String(result.elapsedMs).padStart(6)}ms  ${item.id}  ${line}${count}`)
      }
    }
  } finally {
    if (server?.running) serverRssKb.end = rssKb(serverPid)
    await server?.stop()
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
    runtime,
    seed: seedBase,
    binaryPath,
    binaryVersion: binaryPath ? binaryVersion(binaryPath) : null,
    serverArgs: runtime === 'llama' ? serverArgs : [],
    envServerArgs: runtime === 'llama' ? envServerArgs : [],
    serverRssKb,
    startedAt,
    endedAt: new Date().toISOString(),
    repeats,
    only,
    items: items.length,
    failures,
    avgMs: Math.round(sum((r) => r.elapsedMs) / Math.max(results.length, 1)),
    requests: sum((r) => r.requestCount),
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
