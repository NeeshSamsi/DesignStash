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
  /** What the model does with a person's edit to a pile top (design/specs/look-over.md, L7). */
  pileEdits?: PileEditSteps
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
  check?(coverPath: string, edit: PileEdit, added: string[]): Promise<{ answer: 'yes' | 'no'; reason: string }>
  /** The variant's description with only the edit's change worked in, in a text request. */
  rewrite?(edit: PileEdit, entry: PileEditEntry): Promise<string>
}
