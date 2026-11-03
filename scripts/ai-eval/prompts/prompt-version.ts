import type { AnalysisInput } from '../../../src/shared/inference'
import type { VisionData } from '../vision-data'

/**
 * What a version's `parseResult` gives back. Only these fields are searchable in the app, so they are
 * what the harness scores; a version that asks the model for more (or another shape) maps its reply
 * onto them and can keep the rest in `extra` for people to read.
 */
export interface EvalResult {
  title: string
  description: string
  tags: { category: string; label: string }[]
  /** Words a version wants searchable but not shown. Indexed with the tags, as a keywords column merged into `mockups_fts.tags` would be. */
  keywords?: string[]
  extra?: Record<string, unknown>
}

/** What the harness knows about the cover besides the reply: the input and its cached Vision data. */
export interface ParseContext {
  input: AnalysisInput
  /** `covers/<id>/vision.json`, when there is one. */
  vision: VisionData | undefined
}

/** One chat completion as `AnalyzeContext.chat` returns it. */
export interface ChatReply {
  /** The first choice's message text. */
  raw: string
  /** Every choice, for a request with `n` above 1. */
  choices: { raw: string; logprobs?: unknown }[]
  usage: { promptTokens?: number; completionTokens?: number }
  timings?: Record<string, number>
  /** The first choice's logprobs, when the request asked for them. */
  logprobs?: unknown
  /** Wall time of the request. */
  ms: number
}

export interface AnalyzeContext extends ParseContext {
  imageUrl: string | null
  /** 0 for the first pass, 1… with `--repeat`. */
  repeat: number
  /** This pass's seed: `--seed-base` plus the pass number. */
  seed: number
  /**
   * POSTs one request to llama-server's /v1/chat/completions, with `seed` added unless the request
   * sets its own (`seed: undefined` sends none, so the server picks one). Any other field, such as
   * `logprobs`, `top_logprobs`, `n` or `chat_template_kwargs`, goes through as written. The harness
   * records each request's time and tokens. Throws for an `external` version.
   */
  chat(request: object): Promise<ChatReply>
}

/**
 * One prompt version: `scripts/ai-eval/prompts/<id>.ts`, default export. `buildRequest` returns the
 * whole chat request body for llama-server (the harness only adds a fixed `seed`), so a version can
 * change the messages, the JSON schema, the temperature and the token limit.
 */
export interface PromptVersion {
  id: string
  /** What this version changes and why, for the run log. */
  notes: string
  /** Reads the cover for the model. Defaults to the app's `readCoverAsDataUrl`; null sends the names only. */
  readImage?(path: string): Promise<string | null>
  buildRequest(input: AnalysisInput, imageUrl: string | null): object
  /** Throws when the reply can't be used; the item is recorded as failed and the run goes on. */
  parseResult(raw: string, context?: ParseContext): EvalResult
  /**
   * When present, the harness calls this instead of one `buildRequest` round, so a version can make
   * several requests (or none). Throws when it can't produce a result, like `parseResult`.
   */
  analyze?(ctx: AnalyzeContext): Promise<EvalResult>
  /** `external`: the harness starts no llama-server and `analyze` does its own work. Default `llama`. */
  runtime?: 'llama' | 'external'
}

/** A version that only analyzes: no single request of its own. */
export type AnalyzeVersion = Omit<PromptVersion, 'buildRequest' | 'parseResult' | 'analyze'> &
  Partial<Pick<PromptVersion, 'buildRequest' | 'parseResult'>> & {
    analyze(ctx: AnalyzeContext): Promise<EvalResult>
  }

/** Any default export of `prompts/<id>.ts`. */
export type EvalVersion = PromptVersion | AnalyzeVersion
