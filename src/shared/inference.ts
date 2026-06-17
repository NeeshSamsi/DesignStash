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
}
