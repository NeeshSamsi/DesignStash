import type { AnalysisInput } from '../../../src/shared/inference'

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
  parseResult(raw: string): EvalResult
}
