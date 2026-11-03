/**
 * ai-eval:covers. Reads every real PSD in the DesignStash test set the way an import does and
 * writes what the AI would be given: `items.json` (file name and folders exactly as copy-queue
 * stores them, which `analysisInputFor` hands to `provider.analyze()`), each item's `cover.webp`
 * from `resolveCover`, and a 768px `preview.jpg` for people to look at.
 *
 *   pnpm ai-eval:covers           # reuses covers already made for the same source
 *   pnpm ai-eval:covers --fresh   # reads every PSD again
 *
 * All the real items are dropped at once, as one haul: the zips, the loose PSD and the
 * Long Website Mockup folder. The test set is only read.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import { entryPath, openArchiveEntry } from '../../src/main/import/archive'
import { scanForPsds } from '../../src/main/import/scanner'
import { copyWithHash } from '../../src/main/import/stream-copy'
import { resolveCover } from '../../src/main/psd'
import {
  EVAL_DIR,
  ITEMS_PATH,
  TEST_SET,
  realItemPaths,
  writeJson,
  type EvalItem
} from './eval-files'
import { itemIds } from './item-id'

const PREVIEW_EDGE = 768
const FRESH = process.argv.includes('--fresh')

function previous(): Map<string, EvalItem> {
  if (FRESH || !existsSync(ITEMS_PATH)) return new Map()
  const items = JSON.parse(readFileSync(ITEMS_PATH, 'utf8')) as EvalItem[]
  return new Map(items.map((i) => [i.source.path, i]))
}

/** A kept item is reused when its files are still there. */
function stillThere(item: EvalItem | undefined): item is EvalItem {
  if (!item) return false
  if (item.duplicateOf) return true
  if (item.coverSource === 'none') return true
  return existsSync(item.coverPath) && !!item.previewPath && existsSync(item.previewPath)
}

async function writePreview(coverPath: string, dest: string): Promise<void> {
  await sharp(coverPath)
    .resize(PREVIEW_EDGE, PREVIEW_EDGE, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85 })
    .toFile(dest)
}

async function main(): Promise<void> {
  if (!existsSync(join(TEST_SET, 'MANIFEST.md'))) {
    throw new Error(`No test set at ${TEST_SET} (set DESIGNSTASH_TEST_SET).`)
  }
  const stagingDir = join(EVAL_DIR, 'staging')
  const tmpDir = join(EVAL_DIR, 'tmp')
  rmSync(stagingDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })

  const scan = await scanForPsds(realItemPaths(), { stagingDir })
  // The order copy-queue copies in, so the same PSD bytes keep the same item as the original.
  const psds = [...scan.psds].sort((a, b) => a.psdPath.localeCompare(b.psdPath))
  const ids = itemIds(
    psds.map((p) => ({
      fileName: p.importContext.originalFileName,
      ...(p.archive && { zip: p.archive.name })
    }))
  )
  const kept = previous()
  const bySha = new Map<string, string>()
  const items: EvalItem[] = []

  for (const [i, p] of psds.entries()) {
    const id = ids[i]!
    const zipPath = p.archive ? join(TEST_SET, 'zips', p.archive.name) : undefined
    const sourcePath = p.archive ? entryPath(zipPath!, p.archive.entry) : p.psdPath
    const base = {
      id,
      fileName: p.importContext.originalFileName,
      folderTrail: p.importContext.folderTrail,
      source: {
        ...(p.archive && { zip: p.archive.name, entry: p.archive.entry }),
        path: sourcePath
      }
    }

    const old = kept.get(sourcePath)
    if (stillThere(old) && old.id === id) {
      const duplicateOf = bySha.get(old.sha256)
      if (!duplicateOf) bySha.set(old.sha256, id)
      items.push({ ...old, ...base, ...(duplicateOf ? { duplicateOf } : {}) })
      process.stdout.write(`kept  ${id}\n`)
      continue
    }

    const tmpPsd = join(tmpDir, `${id}.psd`)
    const outDir = join(EVAL_DIR, 'covers', id)
    try {
      const archive = p.archive
      const { sha256 } = await copyWithHash(
        archive ? () => openArchiveEntry(archive.path, archive.entry) : p.psdPath,
        tmpPsd
      )
      const duplicateOf = bySha.get(sha256)
      if (duplicateOf) {
        items.push({ ...base, sha256, coverPath: '', coverSource: 'none', duplicateOf })
        process.stdout.write(`dup   ${id} = ${duplicateOf}\n`)
        continue
      }
      bySha.set(sha256, id)

      rmSync(outDir, { recursive: true, force: true })
      mkdirSync(outDir, { recursive: true })
      // As copy-queue does: the preview from the copy, sidecars matched against where the PSD came from.
      const cover = await resolveCover({
        psdPath: tmpPsd,
        sidecarFor: archive ? entryPath(archive.path, archive.entry) : p.psdPath,
        candidateImagePaths: scan.candidateImagePaths,
        outDir
      })
      if (cover.source === 'none') {
        items.push({ ...base, sha256, coverPath: '', coverSource: 'none' })
      } else {
        const previewPath = join(outDir, 'preview.jpg')
        await writePreview(cover.coverPath, previewPath)
        items.push({
          ...base,
          sha256,
          coverPath: cover.coverPath,
          coverSource: cover.source,
          previewPath
        })
      }
      process.stdout.write(`read  ${id} (${cover.source})\n`)
    } finally {
      rmSync(tmpPsd, { force: true })
    }
  }

  rmSync(stagingDir, { recursive: true, force: true })
  rmSync(tmpDir, { recursive: true, force: true })
  writeJson(ITEMS_PATH, items)

  console.table(
    items.map((i) => ({
      id: i.id,
      fileName: i.fileName,
      folders: i.folderTrail.join(' / '),
      from: i.source.zip ?? basename(i.source.path),
      cover: i.coverSource,
      duplicateOf: i.duplicateOf ?? ''
    }))
  )
  const unique = items.filter((i) => !i.duplicateOf)
  console.log(
    `\n${items.length} PSDs, ${unique.length} unique, ` +
      `${unique.filter((i) => i.coverSource === 'embedded').length} embedded covers, ` +
      `${unique.filter((i) => i.coverSource === 'sidecar').length} sidecar, ` +
      `${unique.filter((i) => i.coverSource === 'none').length} none. Wrote ${ITEMS_PATH}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
