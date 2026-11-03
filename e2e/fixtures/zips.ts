import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { makeZip, type ZipEntrySpec } from '../../src/main/import/__tests__/zips'
import { makePsds } from './app'

/**
 * A zip like one from a free mockup site: real PSDs (each with a usable preview) at the given paths
 * inside it, plus any extra entries such as `__MACOSX` junk or a coupon link. Built with yazl.
 */
export async function makeMockupZip(
  zipPath: string,
  psdEntries: string[],
  extra: ZipEntrySpec[] = []
): Promise<string> {
  const scratch = mkdtempSync(join(tmpdir(), 'designstash-e2e-zip-'))
  try {
    const names = psdEntries.map((e) => basename(e, '.psd'))
    const files = makePsds(scratch, names)
    const entries: ZipEntrySpec[] = psdEntries.map((name, i) => ({
      name,
      data: readFileSync(files[i]!)
    }))
    return await makeZip(zipPath, [...entries, ...extra])
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export { makeZip } from '../../src/main/import/__tests__/zips'
