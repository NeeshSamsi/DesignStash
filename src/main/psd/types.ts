export interface RawImage {
  data: Buffer
  width: number
  height: number
}

export type CoverSource = 'embedded' | 'sidecar' | 'none'

export type CoverResolution =
  | { source: 'embedded'; coverPath: string; thumbPath: string }
  | { source: 'sidecar'; coverPath: string; thumbPath: string; candidateName: string; confidence: number }
  | { source: 'none' }

export interface ResolveCoverInput {
  psdPath: string
  candidateImagePaths: string[]
  outDir: string
}
