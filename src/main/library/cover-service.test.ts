import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { COVER_MAX_BYTES } from '@shared/cover-fit'
import type { Repository } from '../db/repository'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { CoverService, type CoverServiceDeps } from './cover-service'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')])
const GIF = Buffer.from('GIF89a000000')

let sqlite: Database.Database
let repo: Repository
let deps: { [K in keyof CoverServiceDeps]: ReturnType<typeof vi.fn> & CoverServiceDeps[K] }
let head: Buffer
let size: number

beforeEach(() => {
  ;({ sqlite, repo } = createTestDb())
  head = PNG
  size = 1024
  deps = {
    stat: vi.fn(async () => ({ size })),
    readHead: vi.fn(async () => head),
    probe: vi.fn(async () => ({ width: 1600, height: 1200 })),
    makeCover: vi.fn(async (_src: string, outDir: string) => `${outDir}/cover.webp`),
    makeCoverFromRaw: vi.fn(async (_raw, outDir: string) => `${outDir}/cover.webp`),
    readEmbedded: vi.fn(async () => ({ data: Buffer.alloc(4), width: 800, height: 600 })),
    isPlaceholder: vi.fn(async () => false),
    newId: vi.fn(() => 'abc')
  } as typeof deps
})

afterEach(() => sqlite.close())

const make = (overrides = {}) =>
  repo.mockups.createMockup(
    approvedMockup({
      title: 'Phone',
      libraryPath: '/lib/mockups/u1/original.psd',
      coverPath: '/lib/mockups/u1/cover.webp',
      coverSource: 'embedded',
      ...overrides
    })
  )

const service = () => new CoverService(repo, '/library', deps)

describe('setCover', () => {
  it('stores a derived cover under the covers folder and marks it uploaded', async () => {
    const m = make()

    const result = await service().setCover(m.id, '/Users/x/new.png')

    expect(result).toEqual({
      ok: true,
      coverPath: `/library/covers/${m.id}-abc/cover.webp`,
      coverSource: 'user-uploaded',
      width: 1600,
      height: 1200,
      previous: { coverPath: '/lib/mockups/u1/cover.webp', coverSource: 'embedded' }
    })
    expect(deps.makeCover).toHaveBeenCalledWith('/Users/x/new.png', `/library/covers/${m.id}-abc`)
    expect(repo.mockups.getMockup(m.id)).toMatchObject({
      coverPath: `/library/covers/${m.id}-abc/cover.webp`,
      coverSource: 'user-uploaded'
    })
  })

  it.each([
    ['PNG', PNG],
    ['JPG', JPG],
    ['WebP', WEBP]
  ])('accepts a %s', async (_name, bytes) => {
    head = bytes
    const m = make()
    expect(await service().setCover(m.id, '/x/img')).toMatchObject({ ok: true })
  })

  it('rejects a file that is not a PNG, JPG or WebP, whatever its extension', async () => {
    head = GIF
    const m = make()

    expect(await service().setCover(m.id, '/x/cover.png')).toEqual({ ok: false, reason: 'not-image' })
    expect(deps.makeCover).not.toHaveBeenCalled()
    expect(repo.mockups.getMockup(m.id)?.coverSource).toBe('embedded')
  })

  it('rejects a file over 25 MB, and accepts exactly 25 MB', async () => {
    const m = make()
    size = COVER_MAX_BYTES + 1
    expect(await service().setCover(m.id, '/x/big.png')).toEqual({ ok: false, reason: 'too-large' })

    size = COVER_MAX_BYTES
    expect(await service().setCover(m.id, '/x/edge.png')).toMatchObject({ ok: true })
  })

  it('reports an unreadable file and leaves the cover alone', async () => {
    const m = make()

    deps.stat.mockRejectedValueOnce(new Error('ENOENT'))
    expect(await service().setCover(m.id, '/x/gone.png')).toEqual({ ok: false, reason: 'unreadable' })

    deps.probe.mockRejectedValueOnce(new Error('corrupt'))
    expect(await service().setCover(m.id, '/x/bad.png')).toEqual({ ok: false, reason: 'unreadable' })

    deps.makeCover.mockRejectedValueOnce(new Error('corrupt'))
    expect(await service().setCover(m.id, '/x/bad2.png')).toEqual({ ok: false, reason: 'unreadable' })

    expect(repo.mockups.getMockup(m.id)).toMatchObject({
      coverPath: '/lib/mockups/u1/cover.webp',
      coverSource: 'embedded'
    })
  })

  it('throws for a mockup that does not exist', async () => {
    await expect(service().setCover(9999, '/x/a.png')).rejects.toThrow()
  })
})

describe('useEmbeddedCover', () => {
  it('re-reads the preview from the PSD and returns the cover it replaced', async () => {
    const m = make({ coverSource: 'user-uploaded', coverPath: '/library/covers/1-old/cover.webp' })

    const result = await service().useEmbeddedCover(m.id)

    expect(deps.readEmbedded).toHaveBeenCalledWith('/lib/mockups/u1/original.psd')
    expect(result).toEqual({
      ok: true,
      coverPath: `/library/covers/${m.id}-abc/cover.webp`,
      coverSource: 'embedded',
      width: 800,
      height: 600,
      previous: { coverPath: '/library/covers/1-old/cover.webp', coverSource: 'user-uploaded' }
    })
    expect(repo.mockups.getMockup(m.id)).toMatchObject({ coverSource: 'embedded' })
  })

  it('does nothing when the cover is already the embedded preview', async () => {
    const m = make()

    const result = await service().useEmbeddedCover(m.id)

    expect(result).toMatchObject({
      ok: true,
      coverPath: '/lib/mockups/u1/cover.webp',
      coverSource: 'embedded',
      previous: { coverPath: '/lib/mockups/u1/cover.webp', coverSource: 'embedded' }
    })
    expect(deps.readEmbedded).not.toHaveBeenCalled()
  })

  it('says so when the PSD has no usable preview, and keeps the cover', async () => {
    const m = make({ coverSource: 'sidecar' })
    deps.readEmbedded.mockResolvedValueOnce(null)

    expect(await service().useEmbeddedCover(m.id)).toEqual({ ok: false, reason: 'no-embedded' })
    expect(repo.mockups.getMockup(m.id)?.coverSource).toBe('sidecar')
  })

  it('refuses a PSD preview that is only the kit\'s notice ("Delete this layer"), and keeps the cover', async () => {
    // A sidecar replaced the notice at import; making the notice the cover would undo that.
    const m = make({ coverSource: 'sidecar' })
    deps.isPlaceholder.mockResolvedValueOnce(true)

    expect(await service().useEmbeddedCover(m.id)).toEqual({ ok: false, reason: 'placeholder' })
    expect(deps.makeCoverFromRaw).not.toHaveBeenCalled()
    expect(repo.mockups.getMockup(m.id)).toMatchObject({ coverSource: 'sidecar', coverPath: '/lib/mockups/u1/cover.webp' })
  })

  it('reports an unreadable PSD', async () => {
    const m = make({ coverSource: 'sidecar' })
    deps.readEmbedded.mockRejectedValueOnce(new Error('bad psd'))

    expect(await service().useEmbeddedCover(m.id)).toEqual({ ok: false, reason: 'unreadable' })
  })
})
