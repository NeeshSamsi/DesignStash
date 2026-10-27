import { z } from 'zod'

/**
 * Structured output from a VLM (spec §6.4).
 */
export const InferenceResultSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(
    z.object({
      category: z.string(),
      label: z.string()
    })
  )
})

export type InferenceResult = z.infer<typeof InferenceResultSchema>

/**
 * Input for mockup analysis (spec §6.4).
 */
export interface AnalysisInput {
  imagePath: string
  fileName: string
  folderTrail: string[]
  /** Set by a provider when the image it shows has the design slot painted over (`masked-cover.ts`). */
  slotMasked?: boolean
  groupContext?: {
    originalTitle: string
    originalDescription: string
    originalTags: { category: string; label: string }[]
  }
}

/**
 * The core seam for AI inference (spec §6.4).
 * Allows switching between Mock, Local (VLM), and eventually Cloud (BYOK).
 */
export interface InferenceProvider {
  id: string
  name: string
  analyze(input: AnalysisInput): Promise<InferenceResult>
  /**
   * Whether the model is loaded and answering now. False while a llama-server is down or still
   * loading, so the first request would wait for it. Left out, it always is (Apple's model).
   */
  readonly loaded?: boolean
  /** Load the model if it isn't, resolving once it answers. */
  load?(): Promise<void>
  /** Stop whatever the model is working on (a run that hit the hard stop). The next request starts it again. */
  stop?(): Promise<void>
  /** What the model does with a person's edit to a pile top (design/specs/look-over.md, L7). */
  pileEdits?: PileEditSteps
  /**
   * A pile's variations (design/specs/pile-titles.md, L8): the model's words for each mockup, in
   * pile order (the top first), from one request; null where it gave none or said "same". Given the
   * top's own suggested title, a model that names bases (`pileBase`) also gives the pile's base in
   * that request. Left out by a model whose piles take the fallback (Apple).
   */
  pileVariations?(pile: { coverPath: string; fileName: string }[], topTitle?: string): Promise<PileNames>
  /**
   * Whether `pileVariations` also names the pile's base: the top's own title with what not every
   * mockup in the pile has taken out (the 9B, round 4 B). Left out, the base stays the top's title.
   */
  readonly pileBase?: boolean
}

/** What one request named for a pile. */
export interface PileNames {
  /** Each mockup's words, in pile order; null where the model gave none or said "same". */
  variations: (string | null)[]
  /** The pile's base, tidied as a title; null when it wasn't asked for, or nothing was left of it. */
  base: string | null
}

/** A mockup's description and tag labels. */
export interface PileEditEntry {
  description: string
  tags: string[]
}

/** A person's edit to a pile top: its description and tag labels before and after. */
export interface PileEdit {
  before: PileEditEntry
  after: PileEditEntry
}

/** The model steps a pile edit can take. A step the model lacks is left out. */
export interface PileEditSteps {
  /**
   * Whether what the edit added (`added`, words found in code) is true of a variant's cover, and
   * on a no, a few words on why ("this one is on a white backdrop"). Only a model that judges pile
   * edits has it (round 3 C: the 9B).
   */
  check?(coverPath: string, edit: PileEdit, added: string[], signal?: AbortSignal): Promise<{ answer: 'yes' | 'no'; reason: string }>
  /**
   * The variant's description with only the edit's change worked in, in a text request. For both
   * steps, aborting `signal` cancels the model's request, which frees it for the next run.
   */
  rewrite?(edit: PileEdit, entry: PileEditEntry, signal?: AbortSignal): Promise<string>
}
