import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { expect, type E2EApp } from './app'

/**
 * The DesignStash test set: real downloads from free mockup sites (`zips/`, `psds/`, `folders/`)
 * plus generated edge cases (`invalid/`, `edge/`), each with its expected outcome in MANIFEST.md.
 * Read from `DESIGNSTASH_TEST_SET`, else `~/Downloads/DesignStash Test Set`. Specs that need it
 * call `test.skip(!testSet.available, TEST_SET_MISSING)`.
 *
 * Never write into it: specs import from it as dropped files, and copy a file into the test's own
 * userData first when they must change it. Never import the whole set (5.6 GB) in one spec.
 */
const root =
  process.env.DESIGNSTASH_TEST_SET ?? join(homedir(), 'Downloads', 'DesignStash Test Set')

export const TEST_SET_MISSING = 'needs the DesignStash test set (DESIGNSTASH_TEST_SET)'

/** Small real zips, one PSD each, for specs that import real files. */
export const SMALL_REAL_ZIPS = {
  /** 37 MB zip, one 67 MB PSD with an embedded preview. */
  matteSnackBar: 'x1YNY2sMQUKWjkiV9pKn_Matte-Snack-Bar-Mockup.zip',
  /** 45 MB zip, one 88 MB PSD with an embedded preview. */
  sticker: '72adUDsLSCqqtAFoVuDN_Sticker-Mockup.zip'
} as const

function inSet(...parts: string[]): string {
  const path = join(root, ...parts)
  expect(existsSync(path), `the test set has ${parts.join('/')}`).toBe(true)
  return path
}

export const testSet = {
  root,
  available: existsSync(join(root, 'MANIFEST.md')),
  /** A real download in `zips/`. */
  zip: (name: string) => inSet('zips', name),
  /** A real download anywhere in the set, by its path inside it, such as `held-out/drink-can-mockup-matt.zip`. */
  real: (rel: string) => inSet(...rel.split('/')),
  /** A real folder in `folders/`, such as "Mixed Drop". */
  folder: (name: string) => inSet('folders', name),
  /** A generated case, such as `invalid/Empty.zip` or `edge/Unicode_Names.zip`. */
  generated: (rel: string) => inSet(...rel.split('/')),
  /** A file or folder from the set copied into the test's userData, for a spec that must change it. */
  copyIn: (app: E2EApp, path: string): string => {
    const dest = join(app.userData, 'From test set', basename(path))
    mkdirSync(join(dest, '..'), { recursive: true })
    if (path.endsWith('.zip') || path.endsWith('.psd')) copyFileSync(path, dest)
    else cpSync(path, dest, { recursive: true })
    return dest
  }
}
