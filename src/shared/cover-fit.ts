/** Covers are 4:3 everywhere. Rules: design/specs/cover.md. */
export const COVER_ASPECT = 4 / 3

/** Crop to 4:3 when at least this much of the image survives; otherwise show it whole with bars. */
export const COVER_MIN_KEPT = 0.75

/** Accepted cover files: PNG, JPG and WebP, up to 25 MB. */
export const COVER_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']
export const COVER_MAX_BYTES = 25 * 1024 * 1024

export type CoverFitMode = 'crop' | 'bars'

export interface CoverFit {
  mode: CoverFitMode
  /** Share of the image that a centred cover-fill crop to 4:3 keeps (1 = nothing lost). */
  kept: number
  /** The line under the cover, or null when nothing was cropped. */
  note: string | null
}

const EPSILON = 1e-9

/**
 * Crop or bars, from the image's pixel dimensions only. The file is never edited; this only
 * decides how it is displayed. Zoom always shows the full original.
 */
export function coverFit(width: number, height: number): CoverFit {
  if (!(width > 0) || !(height > 0)) return { mode: 'crop', kept: 1, note: null }

  // Integer cross-multiplication keeps the 75% boundary exact (1:1 and 16:9 both keep 0.75).
  const wide = 3 * width >= 4 * height
  const kept = wide ? (4 * height) / (3 * width) : (3 * width) / (4 * height)

  if (kept + EPSILON >= COVER_MIN_KEPT) {
    return { mode: 'crop', kept, note: 1 - kept < EPSILON ? null : 'Cropped to 4:3' }
  }
  return {
    mode: 'bars',
    kept,
    note: wide ? 'Shown whole · much wider than 4:3' : 'Shown whole · much taller than 4:3'
  }
}

export type CoverFileProblem = 'not-image' | 'too-large'

export interface CoverCandidate {
  type: string
  size: number
}

/** Why a file can't be a cover, or null when it can. */
export function coverFileProblem(file: CoverCandidate): CoverFileProblem | null {
  if (!COVER_MIME_TYPES.includes(file.type)) return 'not-image'
  if (file.size > COVER_MAX_BYTES) return 'too-large'
  return null
}

export type CoverPick<T extends CoverCandidate> =
  | {
      ok: true
      file: T
      /** Other files that came with it and were ignored. */ ignored: number
      total: number
    }
  | { ok: false; problem: CoverFileProblem }

/**
 * Picks the cover from dropped, pasted or chosen files: the first image, with the rest ignored.
 * When every file fails, reports the first file's problem.
 */
export function pickCover<T extends CoverCandidate>(files: readonly T[]): CoverPick<T> {
  const first = files[0]
  if (!first) return { ok: false, problem: 'not-image' }
  const images = files.filter((file) => file.type.startsWith('image/'))
  const chosen = images[0]
  if (!chosen) return { ok: false, problem: 'not-image' }
  const problem = coverFileProblem(chosen)
  if (problem) return { ok: false, problem }
  return { ok: true, file: chosen, ignored: files.length - 1, total: files.length }
}
