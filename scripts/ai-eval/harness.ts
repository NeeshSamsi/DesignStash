import { createHash } from 'node:crypto'
import type { ChatCompletion } from '../../src/main/ai/llama-server'
import type { AnalysisInput } from '../../src/shared/inference'
import type { ChatReply, EvalVersion, PromptVersion } from './prompts/prompt-version'

/** The default `--seed-base`: pass 0 of every run used this seed before the option existed. */
export const EVAL_SEED = 42

/** Extra llama-server flags for an experiment, from `DESIGNSTASH_EVAL_SERVER_ARGS` (space-separated). */
export function serverArgsFromEnv(env: NodeJS.ProcessEnv): string[] {
  return (env.DESIGNSTASH_EVAL_SERVER_ARGS ?? '').split(/\s+/).filter(Boolean)
}

export function parseSeedBase(value: string | undefined): number {
  if (value === undefined) return EVAL_SEED
  const n = Number(value)
  if (!/^-?\d+$/.test(value.trim()) || !Number.isSafeInteger(n))
    throw new Error('--seed-base takes a whole number')
  return n
}

/** A one-request version's body: its own request, with the pass seed set over any seed it gives. */
export function singleRequestBody(
  version: Pick<PromptVersion, 'buildRequest'>,
  input: AnalysisInput,
  imageUrl: string | null,
  seed: number
): object {
  return { ...version.buildRequest(input, imageUrl), seed }
}

/** A request from `analyze`: the pass seed first, so the version's own `seed` (even undefined) wins. */
export function analyzeRequestBody(request: object, seed: number): object {
  return { seed, ...request }
}

/** llama-server's reply as versions see it. Fails as `LlamaServer.chat` does when there's no text. */
export function toChatReply(json: ChatCompletion, ms: number): ChatReply {
  const choices = (json.choices ?? []).map((c) => ({
    raw: c.message?.content,
    ...(c.logprobs !== undefined && { logprobs: c.logprobs })
  }))
  const first = choices[0]
  if (typeof first?.raw !== 'string') throw new Error('llama-server reply has no message content')
  return {
    raw: first.raw,
    choices: choices.map((c) => ({ ...c, raw: typeof c.raw === 'string' ? c.raw : '' })),
    usage: {
      ...(json.usage?.prompt_tokens !== undefined && { promptTokens: json.usage.prompt_tokens }),
      ...(json.usage?.completion_tokens !== undefined && {
        completionTokens: json.usage.completion_tokens
      })
    },
    ...(json.timings && { timings: json.timings }),
    ...(first.logprobs !== undefined && { logprobs: first.logprobs }),
    ms
  }
}

/** One request as results.json records it. */
export interface RequestRecord {
  ms: number
  promptTokens?: number
  completionTokens?: number
  timings?: Record<string, number>
  /** Each choice's reply text; kept for `analyze` versions, whose top-level `raw` is null. */
  raw?: string[]
  /** Each choice's logprobs, when the request asked for them. */
  logprobs?: unknown[]
}

const askedForLogprobs = (body: object) => {
  const b = body as { logprobs?: unknown; top_logprobs?: unknown; n_probs?: unknown }
  return b.logprobs === true || typeof b.top_logprobs === 'number' || typeof b.n_probs === 'number'
}

export function requestRecord(reply: ChatReply, body: object, keepRaw: boolean): RequestRecord {
  return {
    ms: reply.ms,
    ...reply.usage,
    ...(reply.timings && { timings: reply.timings }),
    ...(keepRaw && { raw: reply.choices.map((c) => c.raw) }),
    ...(askedForLogprobs(body) && { logprobs: reply.choices.map((c) => c.logprobs ?? null) })
  }
}

/** Throws when a loaded version can't be run: no `analyze` and no single request, or `external` without `analyze`. */
export function checkVersion(version: Partial<EvalVersion>): asserts version is EvalVersion {
  if (version.runtime === 'external' && !version.analyze)
    throw new Error(`${version.id}: an external version needs analyze()`)
  if (!version.analyze && !(version.buildRequest && version.parseResult))
    throw new Error(`${version.id}: a version needs buildRequest and parseResult, or analyze()`)
}

/** The version line from `llama-server --version` (it prints to stderr), or its first line. */
export function parseVersionString(output: string): string | null {
  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.find((l) => /^version\b/i.test(l)) ?? lines[0] ?? null
}

/** `ps -o rss= -p <pid>` output, in kilobytes. Null when the process is gone. */
export function parseRssKb(output: string): number | null {
  const n = Number.parseInt(output.trim(), 10)
  return Number.isFinite(n) ? n : null
}

/** A copy of a request with each image data URL cut to its type, length and a hash, for `--dry` output people can diff. */
export function redactDataUrls(value: unknown): unknown {
  if (typeof value === 'string') {
    const m = /^data:([^;,]+)[^,]*,/.exec(value)
    if (!m) return value
    const hash = createHash('sha256').update(value).digest('hex').slice(0, 16)
    return `data:${m[1]} (${value.length} chars, sha256 ${hash})`
  }
  if (Array.isArray(value)) return value.map(redactDataUrls)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDataUrls(v)]))
  return value
}
