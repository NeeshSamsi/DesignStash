import type { HardwareInfo, ModelTier } from './hardware'
import { recommendTier } from './hardware'

/** One of the two files a vision model needs. */
export interface ModelFile {
  /** Hugging Face direct-download URL. */
  url: string
  sizeBytes: number
  /** SHA-256 of the file (the LFS object id Hugging Face lists). null = skip the integrity check. */
  sha256: string | null
}

export interface ModelEntry {
  id: string
  name: string
  tier: ModelTier
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
   * `<modelsDir>/<id>/model.gguf` and `<modelsDir>/<id>/mmproj.gguf`.
   */
  files: { model: ModelFile; mmproj: ModelFile }
  /** Both files together. */
  sizeBytes: number
  /** Set while the model is waiting on a check. Hidden from the catalogue unless asked for. */
  pending?: 'wp4.1-confirmation'
}

export const MODEL_FILE_NAMES = { model: 'model.gguf', mmproj: 'mmproj.gguf' } as const

function entry(e: Omit<ModelEntry, 'sizeBytes'>): ModelEntry {
  return { ...e, sizeBytes: e.files.model.sizeBytes + e.files.mmproj.sizeBytes }
}

const HF = 'https://huggingface.co'

// Sizes and sha256 come from the Hugging Face file metadata (HEAD requests, no file was downloaded).
export const MODEL_REGISTRY: ModelEntry[] = [
  entry({
    id: 'smolvlm2-2.2b',
    name: 'SmolVLM2 2.2B',
    tier: 'small',
    description: 'Fastest to start. Good enough for clear titles and the obvious tags.',
    languages: ['English'],
    quality: 3,
    speed: 5,
    minMemoryGB: 8,
    files: {
      model: {
        url: `${HF}/ggml-org/SmolVLM2-2.2B-Instruct-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Q4_K_M.gguf`,
        sizeBytes: 1_112_602_656,
        sha256: '0cf76814555b8665149075b74ab6b5c1d428ea1d3d01c1918c12012e8d7c9f58'
      },
      mmproj: {
        url: `${HF}/ggml-org/SmolVLM2-2.2B-Instruct-GGUF/resolve/main/mmproj-SmolVLM2-2.2B-Instruct-Q8_0.gguf`,
        sizeBytes: 592_523_200,
        sha256: 'ae07ea1facd07dd3230c4483b63e8cda96c6944ad2481f33d531f79e892dd024'
      }
    }
  }),
  entry({
    id: 'qwen2.5-vl-3b',
    name: 'Qwen 2.5 VL 3B',
    tier: 'medium',
    description: 'The balanced pick. Reads the design well and still keeps up with a big import.',
    languages: ['English', 'Chinese', 'Japanese', 'Korean', 'French', 'German', 'Spanish'],
    quality: 4,
    speed: 4,
    minMemoryGB: 12,
    files: {
      model: {
        url: `${HF}/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf`,
        sizeBytes: 1_929_901_056,
        sha256: 'd02fe9b69ad8cadbbd228e387667af66612c44bed29ffc8eb1e7caf9ac486c12'
      },
      mmproj: {
        url: `${HF}/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf`,
        sizeBytes: 844_757_728,
        sha256: '980c9b2f78c04e6cff93d277ada09e768394f112d75db3b4e9dea8a69f9fb904'
      }
    }
  }),
  entry({
    id: 'qwen2.5-vl-7b',
    name: 'Qwen 2.5 VL 7B',
    tier: 'large',
    description: 'The most careful reader. Slower, and best on a Mac with plenty of memory.',
    languages: ['English', 'Chinese', 'Japanese', 'Korean', 'French', 'German', 'Spanish'],
    quality: 5,
    speed: 2,
    minMemoryGB: 16,
    files: {
      model: {
        url: `${HF}/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf`,
        sizeBytes: 4_683_072_032,
        sha256: '9258bf05b12686d097ff3b6b18d968ab393649780aa2b3cd67fec43d50554392'
      },
      mmproj: {
        url: `${HF}/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf`,
        sizeBytes: 853_119_712,
        sha256: '2ddb555391bae966e412deab9e07b58afa18bcc06930ba0f1c78a3695ab9e506'
      }
    }
  }),
  entry({
    id: 'moondream2',
    name: 'Moondream 2',
    tier: 'small',
    description: 'A small model that describes images in plain sentences.',
    languages: ['English'],
    quality: 2,
    speed: 5,
    minMemoryGB: 8,
    pending: 'wp4.1-confirmation',
    files: {
      model: {
        url: `${HF}/moondream/moondream2-gguf/resolve/main/moondream2-text-model-f16.gguf`,
        sizeBytes: 2_839_534_976,
        sha256: '4e17e9107fb8781629b3c8ce177de57ffeae90fe14adcf7b99f0eef025889696'
      },
      mmproj: {
        url: `${HF}/moondream/moondream2-gguf/resolve/main/moondream2-mmproj-f16.gguf`,
        sizeBytes: 909_777_984,
        sha256: '4cc1cb3660d87ff56432ebeb7884ad35d67c48c7b9f6b2856f305e39c38eed8f'
      }
    }
  })
]

/** The models to offer. Ones still waiting on a check stay out unless `includePending` is set. */
export function availableModels(opts: { includePending?: boolean } = {}): ModelEntry[] {
  return MODEL_REGISTRY.filter((m) => opts.includePending || !m.pending)
}

export function modelsForTier(tier: ModelTier): ModelEntry[] {
  return availableModels().filter((m) => m.tier === tier)
}

export function getModel(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id)
}

/** The model shown as "Best fit for this Mac": 16 to 32 GB gets Qwen 2.5 VL 3B. */
export function bestFitModelId(hw: HardwareInfo): string {
  const tier = recommendTier(hw)
  const fit = availableModels().find((m) => m.tier === tier)
  if (!fit) throw new Error(`No model for tier ${tier}`)
  return fit.id
}
