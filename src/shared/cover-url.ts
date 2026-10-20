/**
 * How the page asks for a cover image. A mockup's cover is a file in the stash folder, and the page can't
 * load a `file://` address in development (it is served over http), nor one whose path holds a #, ? or %.
 * Covers go through the `stash-cover` scheme instead: the whole path, percent-encoded, as the one path
 * segment of the address. Main answers it, and only for image files inside the stash folder.
 */
export const COVER_SCHEME = 'stash-cover'
const HOST = 'cover'

/** The address of a cover file. `version` changes it after the file is replaced, so the image reloads. */
export function coverUrl(path: string, version = 0): string {
  return `${COVER_SCHEME}://${HOST}/${encodeURIComponent(path)}${version > 0 ? `?v=${version}` : ''}`
}

/** The file path inside a cover address, or null when the address is not one. */
export function pathFromCoverUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${COVER_SCHEME}:` || parsed.hostname !== HOST) return null
  try {
    return decodeURIComponent(parsed.pathname.slice(1)) || null
  } catch {
    return null
  }
}
