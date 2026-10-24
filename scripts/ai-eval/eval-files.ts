import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { CoverSource } from '../../src/main/psd'

/** Where the eval keeps covers, items.json and runs. Never committed. */
export const EVAL_DIR =
  process.env.DESIGNSTASH_AI_EVAL_DIR ??
  join(homedir(), 'Library', 'Application Support', 'DesignStash-dev', 'ai-eval')

export const DEV_DIR = join(homedir(), 'Library', 'Application Support', 'DesignStash-dev')

/** The DesignStash test set. Only ever read. */
export const TEST_SET =
  process.env.DESIGNSTASH_TEST_SET ?? join(homedir(), 'Downloads', 'DesignStash Test Set')

export const ITEMS_PATH = join(EVAL_DIR, 'items.json')

/** One folder per item id: cover.webp, preview.jpg and, when the orchestrator has made it, vision.json. */
export const COVERS_DIR = join(EVAL_DIR, 'covers')

/** The real downloads in the test set, as a designer would drop them. The generated cases are left out. */
/**
 * Downloads kept apart from prompt tuning (test set MANIFEST.md): covered like the rest, scored
 * against `gold-heldout.json` only for the final check.
 */
export const HELD_OUT_DIR = 'held-out'

/** The final check (test set MANIFEST.md): covered like the rest, scored only with `--sign-off`. */
export const SIGN_OFF_DIR = 'sign-off'

const APART_DIRS = [HELD_OUT_DIR, SIGN_OFF_DIR]

function zipsIn(root: string, dir: string): string[] {
  return existsSync(join(root, dir))
    ? readdirSync(join(root, dir))
        .filter((n) => n.toLowerCase().endsWith('.zip'))
        .map((n) => join(root, dir, n))
    : []
}

/** The folder a test set zip is in: `zips/`, `held-out/` or `sign-off/`. */
export function zipDir(name: string, root: string = TEST_SET): string {
  const apart = APART_DIRS.find((dir) => existsSync(join(root, dir, name)))
  return join(root, apart ?? 'zips')
}

export function realItemPaths(root: string = TEST_SET): string[] {
  const zips = readdirSync(join(root, 'zips'))
    .filter((n) => n.toLowerCase().endsWith('.zip'))
    .map((n) => join(root, 'zips', n))
  const apart = APART_DIRS.flatMap((dir) => zipsIn(root, dir))
  const psds = readdirSync(join(root, 'psds'))
    .filter((n) => n.toLowerCase().endsWith('.psd'))
    .map((n) => join(root, 'psds', n))
  return [...zips, ...apart, ...psds, join(root, 'folders', 'Long Website Mockup')].sort()
}

export interface EvalItem {
  /** Stable short id that gold data keys on. */
  id: string
  /** What the app hands the model as the file name. */
  fileName: string
  /** What the app hands the model as the folders. */
  folderTrail: string[]
  source: {
    /** The dropped zip, for a PSD inside one. */
    zip?: string
    /** The PSD's path inside the zip (inside the inner zip, for a zip inside a zip). */
    entry?: string
    /** The PSD on disk, or the zip and entry joined as one label. */
    path: string
  }
  sha256: string
  /** cover.webp, as the app stores it. Empty for a duplicate or when no cover was found. */
  coverPath: string
  coverSource: CoverSource
  /** 768px JPEG of the cover, for people to look at. */
  previewPath?: string
  /** Set on the second copy of the same PSD bytes: that item's id. It is never analysed. */
  duplicateOf?: string
}

export function readItems(): EvalItem[] {
  if (!existsSync(ITEMS_PATH)) {
    throw new Error(`No ${ITEMS_PATH}. Run \`pnpm ai-eval:covers\` first.`)
  }
  return JSON.parse(readFileSync(ITEMS_PATH, 'utf8')) as EvalItem[]
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function runDir(model: string, prompt: string): string {
  return join(EVAL_DIR, 'runs', model, prompt)
}

/** `--name value` from the command line, or undefined. */
export function argValue(name: string, argv: string[] = process.argv): string | undefined {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? undefined : argv[i + 1]
}

export type GoldFile = 'gold.json' | 'gold-heldout.json' | 'gold-signoff.json'

/**
 * A gold file in this folder. `--gold r3` picks round 3's (`gold-r3.json` and the rest, kept from
 * before round 4's colour rule) so round 3's numbers can be reproduced; without it, the current gold.
 */
export function goldPath(file: GoldFile, version: string | undefined = argValue('gold')): string {
  return join(import.meta.dirname, version ? file.replace(/\.json$/, `-${version}.json`) : file)
}
