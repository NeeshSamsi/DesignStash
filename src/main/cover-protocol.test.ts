import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { coverUrl } from '@shared/cover-url'
import { handleCoverRequests, registerCoverScheme, resolveCoverRequest } from './cover-protocol'

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'ds-cover-'))
  // A stash folder whose path has what "Application Support" has, and more.
  const root = join(base, 'Application Support #1 100%', 'Library')
  const folder = join(root, 'mockups', 'abc')
  mkdirSync(folder, { recursive: true })
  const cover = join(folder, 'cover.webp')
  writeFileSync(cover, 'img')
  const outside = join(base, 'outside')
  mkdirSync(outside)
  writeFileSync(join(outside, 'secret.png'), 'secret')
  writeFileSync(join(outside, 'notes.txt'), 'text')
  return { base, root, cover, outside, done: () => rmSync(base, { recursive: true, force: true }) }
}

describe('resolveCoverRequest', () => {
  it('serves a cover in the stash, in a folder with a space, a # and a %', async () => {
    const s = setup()
    const res = await resolveCoverRequest(coverUrl(s.cover), s.root)
    expect(res.ok && res.path.endsWith('cover.webp')).toBe(true)
    s.done()
  })

  it('serves a cover through a versioned address', async () => {
    const s = setup()
    expect((await resolveCoverRequest(coverUrl(s.cover, 4), s.root)).ok).toBe(true)
    s.done()
  })

  it('refuses files outside the stash folder, even images', async () => {
    const s = setup()
    expect(await resolveCoverRequest(coverUrl(join(s.outside, 'secret.png')), s.root)).toEqual({ ok: false, status: 403 })
    s.done()
  })

  it('refuses a path that climbs out of the stash with ..', async () => {
    const s = setup()
    const sneaky = join(s.root, 'mockups', '..', '..', '..', 'outside', 'secret.png')
    expect(await resolveCoverRequest(coverUrl(sneaky), s.root)).toEqual({ ok: false, status: 403 })
    s.done()
  })

  it('refuses a link inside the stash that leads outside it', async () => {
    const s = setup()
    const link = join(s.root, 'mockups', 'abc', 'link.png')
    symlinkSync(join(s.outside, 'secret.png'), link)
    expect(await resolveCoverRequest(coverUrl(link), s.root)).toEqual({ ok: false, status: 403 })
    s.done()
  })

  it('refuses anything that is not an image, even inside the stash', async () => {
    const s = setup()
    const text = join(s.root, 'mockups', 'abc', 'original.psd')
    writeFileSync(text, 'psd')
    expect(await resolveCoverRequest(coverUrl(text), s.root)).toEqual({ ok: false, status: 403 })
    expect(await resolveCoverRequest(coverUrl(join(s.root, 'designstash.db')), s.root)).toEqual({ ok: false, status: 403 })
    s.done()
  })

  it('says not found for a cover that is gone', async () => {
    const s = setup()
    expect(await resolveCoverRequest(coverUrl(join(s.root, 'mockups', 'abc', 'gone.webp')), s.root)).toEqual({ ok: false, status: 404 })
    s.done()
  })

  it('refuses the stash folder itself, a directory named like an image, and addresses that are not covers', async () => {
    const s = setup()
    const dir = join(s.root, 'mockups', 'dir.webp')
    mkdirSync(dir)
    expect(await resolveCoverRequest(coverUrl(dir), s.root)).toEqual({ ok: false, status: 404 })
    expect(await resolveCoverRequest('file:///etc/passwd', s.root)).toEqual({ ok: false, status: 400 })
    expect(await resolveCoverRequest(coverUrl('relative/cover.webp'), s.root)).toEqual({ ok: false, status: 400 })
    s.done()
  })

  it('never writes: the resolver only names a file to read', async () => {
    const s = setup()
    const isFile = vi.fn(async () => true)
    const realpath = vi.fn(async (p: string) => p)
    await resolveCoverRequest(coverUrl(s.cover), s.root, { isFile, realpath })
    expect(isFile).toHaveBeenCalledTimes(1)
    s.done()
  })
})

describe('registration', () => {
  it('declares the scheme as standard and secure before the app is ready', () => {
    const registerSchemesAsPrivileged = vi.fn()
    registerCoverScheme({ registerSchemesAsPrivileged })
    expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
      expect.objectContaining({ scheme: 'stash-cover', privileges: expect.objectContaining({ standard: true, secure: true }) })
    ])
  })

  it('answers GET with the file, refuses other methods and anything outside the stash', async () => {
    const s = setup()
    let handler!: (req: Request) => Promise<Response>
    const fetchFile = vi.fn<(fileUrl: string) => Promise<Response>>(async () => new Response('bytes', { status: 200 }))
    handleCoverRequests({ handle: (_scheme, fn) => void (handler = fn as typeof handler) }, fetchFile, () => s.root)

    const ok = await handler(new Request(coverUrl(s.cover)))
    expect(ok.status).toBe(200)
    expect(fetchFile.mock.calls[0]![0]).toMatch(/^file:\/\//)
    expect(fetchFile.mock.calls[0]![0]).toContain('cover.webp')

    expect((await handler(new Request(coverUrl(s.cover), { method: 'POST', body: 'x' }))).status).toBe(405)
    expect((await handler(new Request(coverUrl(join(s.outside, 'secret.png'))))).status).toBe(403)
    expect(fetchFile).toHaveBeenCalledTimes(1)
    s.done()
  })

  it('follows a stash folder that has moved', async () => {
    const s = setup()
    let handler!: (req: Request) => Promise<Response>
    let root = join(s.base, 'elsewhere')
    mkdirSync(root)
    handleCoverRequests({ handle: (_scheme, fn) => void (handler = fn as typeof handler) }, async () => new Response('x'), () => root)
    expect((await handler(new Request(coverUrl(s.cover)))).status).toBe(403)
    root = s.root
    expect((await handler(new Request(coverUrl(s.cover)))).status).toBe(200)
    s.done()
  })
})
