/**
 * fix-placeholder-covers: a one-off for a dev library imported before placeholder covers were
 * replaced at import (2026-10-22). Close the app first.
 *
 *   pnpm tsx scripts/fix-placeholder-covers.ts [--source <folder or zip>]... [--apply]
 *
 * For each mockup whose cover is a placeholder ("DELETE THIS LAYER": `isPlaceholder`), it looks for
 * the PSD it came from under the sources (default `~/Downloads/DesignStash Test Set`), found by file
 * name and then by content hash, since the stash keeps no source paths. Found, its cover is resolved
 * again the way import now does (the kit's preview beside it, in its folder or zip), written to
 * `covers/<id>-<uuid>/`, and the mockup points at it. A mockup still waiting in To sort or To stash
 * also gets its AI suggestion again: it goes back to pending, and the app's queue picks it up at
 * launch. Without `--apply` it only reports what it would change.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { closeDb, initDb } from '../src/main/db/connection'
import { Repository } from '../src/main/db/repository'
import { listArchive, openArchiveEntry, previewImages } from '../src/main/import/archive'
import { scanForPsds, type ScannedPsd } from '../src/main/import/scanner'
import { isPlaceholder, resolveCover } from '../src/main/psd'

const USER_DATA = join(homedir(), 'Library', 'Application Support', 'designstash')

function libraryRoot(): string {
  if (process.env.DESIGNSTASH_LIBRARY) return process.env.DESIGNSTASH_LIBRARY
  try {
    const settings = JSON.parse(readFileSync(join(USER_DATA, 'settings.json'), 'utf8')) as {
      libraryRoot?: string
    }
    if (settings.libraryRoot) return settings.libraryRoot
  } catch {
    // No settings yet: the default stash folder.
  }
  return join(USER_DATA, 'Library')
}

function sources(): string[] {
  const given = process.argv.flatMap((arg, i, all) => (all[i - 1] === '--source' ? [arg] : []))
  return given.length > 0 ? given : [join(homedir(), 'Downloads', 'DesignStash Test Set')]
}

const open = (psd: ScannedPsd): Promise<Readable> | Readable =>
  psd.archive ? openArchiveEntry(psd.archive.path, psd.archive.entry) : createReadStream(psd.psdPath)

async function sha256(psd: ScannedPsd): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of await open(psd)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const root = libraryRoot()
  const dbPath = join(root, 'designstash.db')
  if (!existsSync(dbPath)) throw new Error(`No stash database at ${dbPath}`)
  const repo = new Repository(initDb(dbPath))

  const all = repo.mockups.getAllMockups().filter((m) => m.deletedAt === null && m.coverPath)
  const placeholders = []
  for (const m of all) {
    if (m.coverSource === 'embedded' && (await isPlaceholder(m.coverPath).catch(() => false))) placeholders.push(m)
  }
  console.log(`${all.length} mockups with covers, ${placeholders.length} with a placeholder cover.`)
  if (placeholders.length === 0) return closeDb()

  const staging = mkdtempSync(join(tmpdir(), 'ds-fix-covers-'))
  try {
    const scan = await scanForPsds(sources(), { stagingDir: staging })
    let changed = 0
    for (const m of placeholders) {
      const name = (m.importContext as { originalFilename?: string } | null)?.originalFilename ?? `${m.title}.psd`
      const sameName = scan.psds.filter((p) => p.importContext.originalFileName === name)
      let source: ScannedPsd | undefined
      for (const p of sameName) if ((await sha256(p)) === m.contentHash) source = p
      if (!source) {
        console.log(`  ${m.id} ${name}: its source isn't in the sources any more, left as it is`)
        continue
      }
      const zip = source.archive?.path
      const images = zip ? previewImages(zip, await listArchive(zip)) : new Map<string, string>()
      const outDir = join(root, 'covers', `${m.id}-${randomUUID()}`)
      const cover = await resolveCover({
        psdPath: m.libraryPath,
        sidecarFor: source.psdPath,
        candidateImagePaths: [...scan.candidateImagePaths, ...images.keys()],
        readImage: async (path) => {
          const entry = images.get(path)
          if (!zip || entry === undefined) return readFile(path)
          return Buffer.concat(await (await openArchiveEntry(zip, entry)).toArray())
        },
        outDir: apply ? outDir : join(staging, 'covers', String(m.id))
      })
      if (cover.source !== 'sidecar') {
        console.log(`  ${m.id} ${name}: no preview image beside it, left as it is`)
        continue
      }
      changed++
      const inbox = m.stage === 'to_sort' || m.stage === 'to_stash'
      console.log(`  ${m.id} ${name}: cover from ${cover.candidateName}${inbox ? ', AI suggestion again' : ''}`)
      if (!apply) continue
      repo.mockups.updateMockup(m.id, {
        coverPath: cover.coverPath,
        coverSource: 'sidecar',
        ...(inbox && { aiStatus: 'pending', aiResult: null })
      })
    }
    console.log(`${changed} ${apply ? 'changed' : 'would change (run again with --apply)'}.`)
  } finally {
    rmSync(staging, { recursive: true, force: true })
    closeDb()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
