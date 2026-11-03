import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { rm, readFile, readdir, rmdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Dev's own data folder (src/main/dev-user-data.ts). The installed app uses DesignStash.
const APP = 'DesignStash-dev'

// Dev tooling the build scripts put in dev's folder (build-helper, fetch-llama-server, ai-eval).
// It is not app state, so a reset keeps it.
const TOOLING = ['llama-server', 'helper', 'ai-eval']

// App artifacts inside a stash folder: named items only, NEVER the folder or other files.
const ARTIFACTS = ['designstash.db', 'designstash.db-shm', 'designstash.db-wal', 'config.json', 'mockups', 'models']

/** Whether `path` sits inside `folder`. macOS disks ignore case. */
function isInside(path, folder) {
  const rel = relative(folder.toLowerCase(), path.toLowerCase())
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

function assertSafe(path) {
  if (!path || path === homedir() || path === '/' || path.split('/').filter(Boolean).length < 2) {
    throw new Error(`refusing unsafe path: ${path}`)
  }
}

/**
 * Back to a first run: clears dev's userData folder (settings, logs, caches, the AI models in
 * <userData>/models, and a stash folder kept inside it), keeping only the dev tooling. A stash
 * folder anywhere else may not be dev's alone, so it is only cleared with `all`, and only the app's
 * own files in it.
 */
export async function devReset({ userData, all }) {
  // Learn the configured libraryRoot BEFORE wiping userData (default if absent).
  let libraryRoot = join(userData, 'Library')
  const settingsPath = join(userData, 'settings.json')
  if (existsSync(settingsPath)) {
    try {
      libraryRoot = JSON.parse(await readFile(settingsPath, 'utf8')).libraryRoot ?? libraryRoot
    } catch {
      // Corrupt: keep the default.
    }
  }
  assertSafe(userData)
  assertSafe(libraryRoot)

  if (isInside(libraryRoot, userData)) {
    console.log('  stash folder is inside userData, removed with it:', libraryRoot)
  } else if (all) {
    for (const a of ARTIFACTS) await rm(join(libraryRoot, a), { recursive: true, force: true })
    console.log('  cleaned app files in', libraryRoot)
  } else {
    console.log('  left alone, since it is outside userData (pass --all to clear the app files in it):', libraryRoot)
  }
  const entries = existsSync(userData) ? await readdir(userData) : []
  for (const name of entries) {
    if (!TOOLING.includes(name)) await rm(join(userData, name), { recursive: true, force: true })
  }
  if (entries.every((name) => !TOOLING.includes(name))) await rmdir(userData).catch(() => {})
  console.log('  cleared', userData, '(kept', TOOLING.join(', ') + ')')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const userData = join(homedir(), 'Library', 'Application Support', APP) // macOS app userData
  try {
    console.log('dev-reset:')
    await devReset({ userData, all: process.argv.includes('--all') })
    console.log('Next launch = fresh first-run (onboarding, default library).')
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
