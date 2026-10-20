/**
 * dev-ingest — local stand-in for the M3 import pipeline.
 *
 * Walks `dev-fixtures/psd/`, runs each PSD through the M2 cover resolver, copies
 * successes into the managed dev Library (mockups/<uuid>/{original.psd,cover.webp,
 * thumb.webp}), and writes `needs_review` rows. Lets us validate M2 against real
 * PSDs before the import UI exists. Inspect the result with `pnpm db:studio`.
 *
 *   pnpm dev:ingest            # ingest, appending to whatever's already there
 *   pnpm dev:ingest --fresh    # wipe existing mockup rows + mockups/ first
 *
 * Sidecar candidates are scoped to each PSD's top-level pack folder so unrelated
 * packs don't cross-match.
 */
import { homedir } from 'node:os'
import { join, relative, sep, basename, extname } from 'node:path'
import { mkdirSync, copyFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

import { initDb, closeDb } from '../src/main/db/connection'
import { runMigrations } from '../src/main/db/migrate'
import { seedTaxonomy } from '../src/main/db/bootstrap'
import { Repository } from '../src/main/db/repository'
import { mockups } from '../src/main/db/schema'
import { resolveCover, collectCandidateImages } from '../src/main/psd'

const REPO_ROOT = process.cwd()
const FIXTURES = join(REPO_ROOT, 'dev-fixtures', 'psd')
const LIBRARY_ROOT =
  process.env.DESIGNSTASH_LIBRARY ??
  join(homedir(), 'Library', 'Application Support', 'designstash', 'Library')
const MOCKUPS_DIR = join(LIBRARY_ROOT, 'mockups')
const FRESH = process.argv.includes('--fresh')

/** Recursively collect *.psd paths under a root. */
function collectPsds(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) out.push(...collectPsds(full))
    else if (extname(entry.name).toLowerCase() === '.psd') out.push(full)
  }
  return out
}

/** Top-level pack folder for a PSD (first path segment under FIXTURES), or FIXTURES itself. */
function packRoot(psdPath: string): string {
  const segments = relative(FIXTURES, psdPath).split(sep)
  return segments.length > 1 ? join(FIXTURES, segments[0]) : FIXTURES
}

async function main(): Promise<void> {
  if (!existsSync(FIXTURES)) {
    console.error(`No drop zone at ${FIXTURES}. Create it and add PSDs first.`)
    process.exit(1)
  }

  const db = initDb(join(LIBRARY_ROOT, 'designstash.db'))
  runMigrations(db, join(REPO_ROOT, 'drizzle'))
  seedTaxonomy(db)
  const repo = new Repository(db)

  if (FRESH) {
    db.delete(mockups).run()
    if (existsSync(MOCKUPS_DIR)) rmSync(MOCKUPS_DIR, { recursive: true, force: true })
    console.log('--fresh: cleared existing mockup rows + mockups/ folder.\n')
  }

  const psds = collectPsds(FIXTURES)
  console.log(`Found ${psds.length} PSD(s) under ${relative(REPO_ROOT, FIXTURES)}\n`)

  const rows: { file: string; source: string; detail: string }[] = []

  for (const psdPath of psds) {
    const title = basename(psdPath, extname(psdPath))
    const candidateImagePaths = collectCandidateImages(packRoot(psdPath))
    const uuid = randomUUID()
    const destDir = join(MOCKUPS_DIR, uuid)

    try {
      const res = await resolveCover({ psdPath, candidateImagePaths, outDir: destDir })

      if (res.source === 'none') {
        rows.push({ file: title, source: 'none', detail: 'needs manual upload (skipped)' })
        continue
      }

      mkdirSync(destDir, { recursive: true })
      const libraryPsd = join(destDir, 'original.psd')
      copyFileSync(psdPath, libraryPsd)

      repo.mockups.createMockup({
        title,
        libraryPath: libraryPsd,
        coverPath: res.coverPath,
        coverSource: res.source
      })

      const detail =
        res.source === 'sidecar'
          ? `${res.candidateName} (confidence ${res.confidence.toFixed(2)})`
          : 'embedded composite'
      rows.push({ file: title, source: res.source, detail })
    } catch (err) {
      rmSync(destDir, { recursive: true, force: true })
      rows.push({ file: title, source: 'ERROR', detail: err instanceof Error ? err.message : String(err) })
    }
  }

  console.table(rows)
  const ingested = rows.filter((r) => r.source === 'embedded' || r.source === 'sidecar').length
  console.log(
    `\nIngested ${ingested}/${psds.length} into ${relative(homedir(), LIBRARY_ROOT)}. ` +
      `Inspect with \`pnpm db:studio\`.`
  )
  closeDb()
}

main().catch((err) => {
  console.error(err)
  closeDb()
  process.exit(1)
})
