import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { Transform } from 'node:stream'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/** One read at a time of this size, so progress moves in small steps even on a big PSD. */
const CHUNK_BYTES = 1024 * 1024

/** A file on disk, or a way to open a stream of it (an entry inside a zip). */
export type CopySource = string | (() => Promise<Readable>)

/**
 * Copy a file by streaming it, so the caller hears about every chunk, and work out its SHA-256 in
 * the same pass (one read of the original, not two). The original is only ever read. If the copy
 * fails part way, what was written is removed by the caller along with its folder.
 */
export async function copyWithHash(
  src: CopySource,
  dest: string,
  onBytes: (written: number) => void = () => {}
): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256')
  let bytes = 0
  const tap = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      bytes += chunk.length
      onBytes(bytes)
      callback(null, chunk)
    }
  })
  const input =
    typeof src === 'string' ? createReadStream(src, { highWaterMark: CHUNK_BYTES }) : await src()
  await pipeline(input, tap, createWriteStream(dest))
  return { sha256: hash.digest('hex'), bytes }
}
