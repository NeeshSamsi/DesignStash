import { homedir } from 'node:os'
import { join } from 'node:path'
import { rm, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const APP = 'designstash'
const userData = join(homedir(), 'Library', 'Application Support', APP)   // macOS app userData
const settingsPath = join(userData, 'settings.json')

// Learn the configured libraryRoot BEFORE wiping userData (default if absent)
let libraryRoot = join(userData, 'Library')
if (existsSync(settingsPath)) {
  try { libraryRoot = JSON.parse(await readFile(settingsPath, 'utf8')).libraryRoot ?? libraryRoot } catch { /* corrupt/missing — keep default */ }
}
const modelsDir = join(libraryRoot, '..', 'models')

// SAFETY GUARD: refuse to operate on obviously-wrong roots
for (const p of [userData, libraryRoot]) {
  if (!p || p === homedir() || p === '/' || p.split('/').filter(Boolean).length < 2) {
    console.error(`refusing unsafe path: ${p}`); process.exit(1)
  }
}

// 1) App artifacts INSIDE libraryRoot — named items only, NEVER the folder or other files
const ARTIFACTS = ['designstash.db', 'designstash.db-shm', 'designstash.db-wal', 'config.json', 'mockups', 'models']
for (const a of ARTIFACTS) await rm(join(libraryRoot, a), { recursive: true, force: true })
// 2) Derived models dir (sibling of libraryRoot)
await rm(modelsDir, { recursive: true, force: true })
// 3) Whole app userData (settings + stale Library/models + Electron caches)
await rm(userData, { recursive: true, force: true })

console.log('dev-reset complete:')
console.log('  cleaned libraryRoot artifacts in', libraryRoot)
console.log('  removed', modelsDir)
console.log('  removed', userData)
console.log('Next launch = fresh first-run (onboarding, default library).')
