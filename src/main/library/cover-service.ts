import { randomUUID } from 'node:crypto'
import { open, stat } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { COVER_MAX_BYTES, type CoverChange } from '@shared/library'
import type { Repository } from '../db/repository'
import { readEmbeddedPreview } from '../psd/embedded'
import { generateCoverFromFile, generateCoverFromRaw } from '../psd/image'
import type { RawImage } from '../psd/types'

export interface CoverServiceDeps {
  stat: (path: string) => Promise<{ size: number }>
  /** The first bytes of a file, enough to tell the image type. */
  readHead: (path: string) => Promise<Buffer>
  probe: (path: string) => Promise<{ width: number; height: number }>
  /** Write the cover (and thumbnail) for an image into `outDir`; returns the cover path. */
  makeCover: (srcPath: string, outDir: string) => Promise<string>
  makeCoverFromRaw: (raw: RawImage, outDir: string) => Promise<string>
  readEmbedded: (psdPath: string) => Promise<RawImage | null>
  newId: () => string
}

const defaultDeps: CoverServiceDeps = {
  stat: async (path) => stat(path),
  readHead: async (path) => {
    const file = await open(path, 'r')
    try {
      const buf = Buffer.alloc(12)
      const { bytesRead } = await file.read(buf, 0, 12, 0)
      return buf.subarray(0, bytesRead)
    } finally {
      await file.close()
    }
  },
  probe: async (path) => {
    const { width, height } = await sharp(path).metadata()
    if (!width || !height) throw new Error('No image size')
    return { width, height }
  },
  makeCover: async (srcPath, outDir) => (await generateCoverFromFile(srcPath, outDir)).coverPath,
  makeCoverFromRaw: async (raw, outDir) => (await generateCoverFromRaw(raw, outDir)).coverPath,
  readEmbedded: readEmbeddedPreview,
  newId: randomUUID
}

/** PNG, JPG and WebP by their first bytes, so a renamed file doesn't pass. */
function isAcceptedImage(head: Buffer): boolean {
  const png = head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const jpg = head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
  const webp =
    head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP'
  return png || jpg || webp
}

/**
 * Replace or revert a mockup's cover. Covers are stored by the app under `covers/`, one folder per
 * change, so the cover being replaced stays on disk for Undo. The image the user picked is never edited.
 */
export class CoverService {
  private readonly deps: CoverServiceDeps

  constructor(
    private readonly repo: Repository,
    private readonly libraryRoot: string,
    deps?: Partial<CoverServiceDeps>
  ) {
    this.deps = { ...defaultDeps, ...deps }
  }

  async setCover(mockupId: number, filePath: string): Promise<CoverChange> {
    const mockup = this.repo.getMockup(mockupId)
    if (!mockup) throw new Error(`Mockup ${mockupId} not found`)

    try {
      if (!isAcceptedImage(await this.deps.readHead(filePath))) {
        return { ok: false, reason: 'not-image' }
      }
      if ((await this.deps.stat(filePath)).size > COVER_MAX_BYTES) {
        return { ok: false, reason: 'too-large' }
      }
      const { width, height } = await this.deps.probe(filePath)
      const coverPath = await this.deps.makeCover(filePath, this.newCoverDir(mockupId))
      return this.apply(mockupId, coverPath, 'user-uploaded', width, height)
    } catch {
      return { ok: false, reason: 'unreadable' }
    }
  }

  /** Go back to the preview inside the PSD. A no-op when it's already the cover. */
  async useEmbeddedCover(mockupId: number): Promise<CoverChange> {
    const mockup = this.repo.getMockup(mockupId)
    if (!mockup) throw new Error(`Mockup ${mockupId} not found`)

    if (mockup.coverSource === 'embedded') {
      const { width, height } = await this.deps
        .probe(mockup.coverPath)
        .catch(() => ({ width: 0, height: 0 }))
      const current = { coverPath: mockup.coverPath, coverSource: 'embedded' as const }
      return { ok: true, ...current, width, height, previous: current }
    }

    try {
      const raw = await this.deps.readEmbedded(mockup.libraryPath)
      if (!raw) return { ok: false, reason: 'no-embedded' }
      const coverPath = await this.deps.makeCoverFromRaw(raw, this.newCoverDir(mockupId))
      return this.apply(mockupId, coverPath, 'embedded', raw.width, raw.height)
    } catch {
      return { ok: false, reason: 'unreadable' }
    }
  }

  private newCoverDir(mockupId: number): string {
    return join(this.libraryRoot, 'covers', `${mockupId}-${this.deps.newId()}`)
  }

  private apply(
    mockupId: number,
    coverPath: string,
    coverSource: 'embedded' | 'user-uploaded',
    width: number,
    height: number
  ): CoverChange {
    const before = this.repo.getMockup(mockupId)
    if (!before) throw new Error(`Mockup ${mockupId} not found`)
    this.repo.setMockupCover(mockupId, coverPath, coverSource)
    return {
      ok: true,
      coverPath,
      coverSource,
      width,
      height,
      previous: { coverPath: before.coverPath, coverSource: before.coverSource }
    }
  }
}
