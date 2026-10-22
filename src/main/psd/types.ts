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
  /** The PSD to read the embedded preview from. */
  psdPath: string
  /** Where the PSD came from, for matching sidecar images by name and folder. Defaults to `psdPath`. */
  sidecarFor?: string
  candidateImagePaths: string[]
  /**
   * Reads a candidate image. Defaults to reading the file; the importer passes one that also reads
   * the images inside the zip a PSD came out of, whose paths are labels (see `entryPath`).
   */
  readImage?: (path: string) => Promise<Buffer>
  outDir: string
}
