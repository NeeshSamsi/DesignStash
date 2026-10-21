import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { once } from 'node:events'
import { ZipFile } from 'yazl'

export interface ZipEntrySpec {
  name: string
  /** File contents. Leave out for a folder entry (a name ending in `/`). */
  data?: Buffer | string
  /** Deflate it (the default), or store it as is. */
  compress?: boolean
}

/** Write a real zip to `path` for a test. Never the user's own downloads. */
export async function makeZip(path: string, entries: ZipEntrySpec[]): Promise<string> {
  const zip = new ZipFile()
  for (const e of entries) {
    if (e.name.endsWith('/')) zip.addEmptyDirectory(e.name)
    else
      zip.addBuffer(Buffer.from(e.data ?? ''), e.name, {
        compress: e.compress ?? true
      })
  }
  zip.end()
  mkdirSync(dirname(path), { recursive: true })
  const out = createWriteStream(path)
  zip.outputStream.pipe(out)
  await once(out, 'close')
  return path
}

/** A zip as bytes, for nesting one zip inside another. */
export async function zipBytes(path: string, entries: ZipEntrySpec[]): Promise<Buffer> {
  await makeZip(path, entries)
  return readFileSync(path)
}

/**
 * Set the "encrypted" flag on every entry, as a password-protected zip has it. The contents stay
 * plain, which is enough: the app never tries to read an entry flagged this way.
 */
export function markEncrypted(path: string): void {
  const buf = readFileSync(path)
  for (let i = 0; i + 4 <= buf.length; i++) {
    const sig = buf.readUInt32LE(i)
    // Local file header: flags at +6. Central directory header: flags at +8.
    if (sig === 0x04034b50) buf.writeUInt16LE(buf.readUInt16LE(i + 6) | 1, i + 6)
    else if (sig === 0x02014b50) buf.writeUInt16LE(buf.readUInt16LE(i + 8) | 1, i + 8)
  }
  writeFileSync(path, buf)
}
