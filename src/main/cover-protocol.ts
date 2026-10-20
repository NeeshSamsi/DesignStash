import { promises as fs } from 'node:fs'
import { extname, isAbsolute, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { COVER_SCHEME, pathFromCoverUrl } from '@shared/cover-url'

/** The only kinds of file a cover address serves. */
const IMAGE_TYPES = new Set(['.webp', '.png', '.jpg', '.jpeg'])

export type CoverRequest = { ok: true; path: string } | { ok: false; status: 400 | 403 | 404 }

export interface CoverRequestDeps {
  realpath: (path: string) => Promise<string>
  isFile: (path: string) => Promise<boolean>
}

const defaultDeps: CoverRequestDeps = {
  realpath: (p) => fs.realpath(p),
  isFile: (p) => fs.stat(p).then((s) => s.isFile(), () => false)
}

/**
 * Decide what a cover address may read. Read-only by construction: it only ever names a file to send.
 * The file has to be an image, and after links are followed it has to sit inside the stash folder, so
 * no address can reach anything else on the disk.
 */
export async function resolveCoverRequest(
  url: string,
  stashRoot: string,
  deps: Partial<CoverRequestDeps> = {}
): Promise<CoverRequest> {
  const { realpath, isFile } = { ...defaultDeps, ...deps }
  const wanted = pathFromCoverUrl(url)
  if (!wanted || !isAbsolute(wanted)) return { ok: false, status: 400 }
  if (!IMAGE_TYPES.has(extname(wanted).toLowerCase())) return { ok: false, status: 403 }

  let real: string
  let root: string
  try {
    real = await realpath(wanted)
    root = await realpath(stashRoot)
  } catch {
    return { ok: false, status: 404 }
  }
  const rel = relative(root, real)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return { ok: false, status: 403 }
  if (!(await isFile(real))) return { ok: false, status: 404 }
  return { ok: true, path: real }
}

/** Must run before the app is ready: the scheme needs to be standard so the page can use it like a URL. */
export function registerCoverScheme(
  protocol: Pick<Electron.Protocol, 'registerSchemesAsPrivileged'>
): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: COVER_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** Answer cover addresses from the stash folder. `stashRoot` is read on every request, so a moved stash is followed. */
export function handleCoverRequests(
  protocol: Pick<Electron.Protocol, 'handle'>,
  fetchFile: (fileUrl: string) => Promise<Response>,
  stashRoot: () => string
): void {
  protocol.handle(COVER_SCHEME, async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405 })
    }
    const result = await resolveCoverRequest(request.url, stashRoot())
    if (!result.ok) return new Response(null, { status: result.status })
    return fetchFile(pathToFileURL(result.path).toString())
  })
}
