import type { ModelTier } from './hardware'

export interface ModelEntry {
  id: string
  name: string
  tier: ModelTier
  sizeBytes: number
  /** HuggingFace direct-download URL for the GGUF file. */
  url: string
  /** SHA-256 of the GGUF file. null = skip integrity check (fill before release). */
  sha256: string | null
}

export const MODEL_REGISTRY: ModelEntry[] = [
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen 2.5 1.5B',
    tier: 'small',
    sizeBytes: 1_040_000_000,
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sha256: null // TODO: fill before release
  },
  {
    id: 'phi-3.5-mini',
    name: 'Phi 3.5 Mini',
    tier: 'medium',
    sizeBytes: 2_400_000_000,
    url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
    sha256: null // TODO: fill before release
  }
]

export function modelsForTier(tier: ModelTier): ModelEntry[] {
  return MODEL_REGISTRY.filter((m) => m.tier === tier)
}

export function getModel(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id)
}
