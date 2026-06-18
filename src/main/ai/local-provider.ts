import { basename } from 'node:path'
import type { InferenceProvider, AnalysisInput, InferenceResult } from '../../shared/inference'
import { InferenceResultSchema } from '../../shared/inference'

const TAXONOMY = `Categories and example labels:
- Device: MacBook, iPhone, iPad, Desktop, Android Phone, Smartwatch
- Context: E-commerce, Dashboard, Landing Page, Onboarding, Settings, Profile, Blog, Marketing
- Industry: SaaS, Fintech, Health, Travel, Education, Social, Retail
- Style: Minimal, Dark Mode, Light Mode, Glassmorphism, Material, Flat
- Platform: Web, iOS, Android, macOS`

function buildPrompt(input: AnalysisInput): string {
  const lines = [`Filename: ${input.fileName}`]
  if (input.folderTrail.length > 0) {
    lines.push(`Folder path: ${input.folderTrail.join(' / ')}`)
  }
  if (input.groupContext) {
    lines.push(`Variant of: "${input.groupContext.originalTitle}"`)
  }

  return `You are tagging a UI design mockup file for an asset manager. Based ONLY on the filename and folder path below, generate structured metadata.

${lines.join('\n')}

Return ONLY a valid JSON object — no preamble, no markdown, nothing else:
{
  "title": "<concise title, max 60 chars>",
  "description": "<one-sentence description, max 200 chars>",
  "tags": [{"category": "...", "label": "..."}]
}

${TAXONOMY}

Use 3–6 tags. Return ONLY the JSON.`
}

function parseResponse(raw: string): InferenceResult {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error(`No JSON found in model response: ${raw.slice(0, 120)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    throw new Error(`Invalid JSON in model response: ${match[0].slice(0, 120)}`)
  }
  const validated = InferenceResultSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(`Model response did not match schema: ${validated.error.message}`)
  }
  return validated.data
}

/**
 * Inference provider backed by a local GGUF model via node-llama-cpp.
 * Text-only: derives tags/title/description from filename + folder trail.
 * The `promptFn` parameter is injected in tests; the real llama path is
 * loaded lazily via dynamic import so it never runs in CI.
 */
export class LocalInferenceProvider implements InferenceProvider {
  readonly id = 'local'
  readonly name: string

  private cachedPromptFn: ((prompt: string) => Promise<string>) | null = null

  constructor(
    private readonly modelPath: string,
    private readonly promptFn?: (prompt: string) => Promise<string>
  ) {
    this.name = basename(modelPath, '.gguf')
  }

  async analyze(input: AnalysisInput): Promise<InferenceResult> {
    if (!this.cachedPromptFn) {
      this.cachedPromptFn = this.promptFn ?? (await this.loadLlamaFn())
    }
    const response = await this.cachedPromptFn(buildPrompt(input))
    return parseResponse(response)
  }

  private async loadLlamaFn(): Promise<(prompt: string) => Promise<string>> {
    // Dynamic import keeps node-llama-cpp (native binary) out of CI module graph.
    // Context is created once and reused; each prompt gets a fresh session on its
    // own sequence so independent mockups don't share chat history.
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp')
    const llama = await getLlama()
    const model = await llama.loadModel({ modelPath: this.modelPath })
    const context = await model.createContext()

    return async (prompt: string) => {
      const session = new LlamaChatSession({ contextSequence: context.getSequence() })
      return session.prompt(prompt)
    }
  }

  async dispose(): Promise<void> {
    this.cachedPromptFn = null
  }
}
