import type { HardwareInfo, ModelTier } from './hardware'
import type { PromptProfileId } from './prompts'

/** One of the two files a vision model needs. */
export interface ModelFile {
  /** Hugging Face direct-download URL. */
  url: string
  sizeBytes: number
  /** SHA-256 of the file (the LFS object id Hugging Face lists). null = skip the integrity check. */
  sha256: string | null
}

/** What runs a model: llama-server with its GGUF files, or Apple's model through the Swift helper. */
export type ModelRuntime = 'llama' | 'apple'

export interface ModelEntry {
  id: string
  name: string
  tier: ModelTier
  runtime: ModelRuntime
  /** The prompt profile it is asked with (`prompts/<id>.ts`). */
  prompt: PromptProfileId
  /** One plain line for the model card. */
  description: string
  languages: string[]
  /** 1 to 5, drawn as five-step bars. */
  quality: number
  speed: number
  /** Memory the Mac needs to run it comfortably. */
  minMemoryGB: number
  /**
   * The language model and its image projector (mmproj). They are downloaded together and kept at
   * `<modelsDir>/<id>/model.gguf` and `<modelsDir>/<id>/mmproj.gguf`. Null for a built-in model.
   */
  files: { model: ModelFile; mmproj: ModelFile } | null
  /** Both files together; 0 for a built-in model. */
  sizeBytes: number
}

export const MODEL_FILE_NAMES = { model: 'model.gguf', mmproj: 'mmproj.gguf' } as const

function entry(e: Omit<ModelEntry, 'sizeBytes'>): ModelEntry {
  return { ...e, sizeBytes: e.files ? e.files.model.sizeBytes + e.files.mmproj.sizeBytes : 0 }
}

/** A model that comes with macOS: nothing to download, delete or set aside. */
export function isBuiltIn(model: ModelEntry): boolean {
  return model.files === null
}

const HF = 'https://huggingface.co'

const QWEN_LANGUAGES = ['English', 'Chinese', 'Japanese', 'Korean', 'French', 'German', 'Spanish']

// Picked in the AI bake-off (Research hub, "AI bake-off"). Files, sizes and sha256 are from
// design/research/vlm-models.md (the Hugging Face listings), and the downloaded files matched.
// Speeds and memory were measured on an M3 Max; quality weighs hallucinated answers and searches found.
export const MODEL_REGISTRY: ModelEntry[] = [
  entry({
    id: 'qwen3-vl-4b',
    name: 'Qwen3-VL 4B',
    tier: 'medium',
    runtime: 'llama',
    prompt: 'qwen3-vl-4b',
    // 5% of answers hallucinated, 3.6 s per mockup, 4.4 GB in memory after the first answer.
    description:
      'Accurate titles and tags at a quick pace. Uses about 4.4 GB of memory while it works.',
    languages: QWEN_LANGUAGES,
    quality: 4,
    speed: 4,
    minMemoryGB: 8,
    files: {
      model: {
        url: `${HF}/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf`,
        sizeBytes: 2_497_281_664,
        sha256: '66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a'
      },
      mmproj: {
        url: `${HF}/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf`,
        sizeBytes: 453_974_304,
        sha256: '30ba2c7dd3127a4561b6cba9d13d0f711c91bdb38742e2f56d73c8cb596bd06d'
      }
    }
  }),
  entry({
    id: 'qwen3.5-9b',
    name: 'Qwen3.5 9B',
    tier: 'large',
    runtime: 'llama',
    prompt: 'qwen3.5-9b',
    // 6% hallucinated and the most searches found, 10 s per mockup, about 7 GB in memory.
    description:
      'The richest descriptions, with the other names people search for. Slower, and uses about 7 GB of memory.',
    languages: QWEN_LANGUAGES,
    quality: 5,
    speed: 3,
    minMemoryGB: 16,
    files: {
      model: {
        url: `${HF}/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf`,
        sizeBytes: 5_680_522_464,
        sha256: '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8'
      },
      mmproj: {
        url: `${HF}/unsloth/Qwen3.5-9B-GGUF/resolve/main/mmproj-F16.gguf`,
        sizeBytes: 918_166_080,
        sha256: 'f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f'
      }
    }
  }),
  entry({
    id: 'apple',
    name: 'Apple’s on-device model',
    tier: 'small',
    runtime: 'apple',
    prompt: 'apple',
    // The fewest hallucinations (2.8%) and 2.5 s per mockup, with thinner wording. macOS 27 with
    // Apple Intelligence on; offered only when the helper says the model is ready.
    description:
      'Built into macOS with Apple Intelligence, so there is nothing to download. The fastest, with shorter descriptions.',
    languages: [
      'English',
      'Chinese',
      'Japanese',
      'Korean',
      'French',
      'German',
      'Spanish',
      'Italian',
      'Portuguese'
    ],
    quality: 3,
    speed: 5,
    minMemoryGB: 8,
    files: null
  })
]

/** The models to offer: Qwen3-VL 4B (the default), Qwen3.5 9B and Apple's built-in model. */
export function availableModels(): ModelEntry[] {
  return MODEL_REGISTRY
}

export function modelsForTier(tier: ModelTier): ModelEntry[] {
  return MODEL_REGISTRY.filter((m) => m.tier === tier)
}

export function getModel(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id)
}

/**
 * The model shown as "Best fit for this Mac": Qwen3-VL 4B on every Mac. The 9B writes better but
 * at about three times the time per mockup, so it stays a choice for Macs with memory to spare.
 */
export function bestFitModelId(hw: HardwareInfo): string {
  const fit =
    MODEL_REGISTRY.find((m) => m.tier === 'medium' && m.minMemoryGB <= hw.totalMemoryGB) ??
    MODEL_REGISTRY.find((m) => m.tier === 'medium')
  if (!fit) throw new Error('No medium model in the catalogue')
  return fit.id
}
