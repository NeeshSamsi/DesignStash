// Makes sure better-sqlite3 has the build each runtime needs. The two builds live in separate
// places, so nothing ever flips one into the other:
//   node scripts/rebuild-better-sqlite3.mjs node       the default build/Release one, for Node
//                                                      (vitest, the seed tool, db:studio)
//   node scripts/rebuild-better-sqlite3.mjs electron   a copy under node_modules/.cache/, loaded by
//                                                      the app in dev and e2e (see
//                                                      src/main/db/native-binding.ts)
//
// The Electron copy is compiled in a temp copy of the package against Electron's headers, checked
// by loading it under Electron, and moved into place with a rename, so a reader never sees half a
// file and the package's own build/ is never touched. A lock folder makes concurrent runs (two
// `pnpm dev`, or dev next to a test run) wait for one build instead of racing.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const target = process.argv[2] === 'node' ? 'node' : 'electron'
const pkgDir = realpathSync(dirname(require.resolve('better-sqlite3/package.json')))
// The folder that holds better-sqlite3. src/main/db/native-binding.ts derives the same one.
const nodeModulesDir = dirname(pkgDir)

const LOCK_STALE_MS = 15 * 60 * 1000
const LOCK_POLL_MS = 500

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

/** Runs `fn` while holding a lock folder; a lock left by a dead or hung run is taken over. */
async function withLock(name, fn) {
  const lockDir = join(nodeModulesDir, '.cache', `${name}.lock`)
  mkdirSync(dirname(lockDir), { recursive: true })
  for (;;) {
    try {
      mkdirSync(lockDir)
      writeFileSync(join(lockDir, 'pid'), String(process.pid))
      break
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      let stale
      try {
        const owner = Number(readFileSync(join(lockDir, 'pid'), 'utf8'))
        stale = !pidAlive(owner) || Date.now() - statSync(lockDir).mtimeMs > LOCK_STALE_MS
      } catch {
        stale = Date.now() - statSync(lockDir, { throwIfNoEntry: false })?.mtimeMs > LOCK_STALE_MS
      }
      if (stale) rmSync(lockDir, { recursive: true, force: true })
      else await sleep(LOCK_POLL_MS)
    }
  }
  try {
    return await fn()
  } finally {
    rmSync(lockDir, { recursive: true, force: true })
  }
}

/** True when the default build/Release binary loads under this Node. */
function nodeBuildWorks() {
  try {
    execFileSync(
      process.execPath,
      ['-e', `new (require(${JSON.stringify(pkgDir)}))(':memory:').close()`],
      { stdio: 'ignore' }
    )
    return true
  } catch {
    return false
  }
}

async function ensureNode() {
  if (nodeBuildWorks()) {
    console.log('better-sqlite3 already built for node; skipping.')
    return
  }
  await withLock('better-sqlite3-node', () => {
    if (nodeBuildWorks()) return
    console.log('Rebuilding better-sqlite3 for node…')
    rmSync(join(pkgDir, 'build'), { recursive: true, force: true })
    execFileSync('npm', ['rebuild', 'better-sqlite3'], { stdio: 'inherit' })
    console.log('better-sqlite3 rebuilt for node.')
  })
}

const electronBinary = require('electron')
const electronVersion = require('electron/package.json').version
const electronCopy = join(
  nodeModulesDir,
  '.cache',
  'better-sqlite3-electron',
  `${electronVersion}-${process.arch}`,
  'better_sqlite3.node'
)

/** True when the file loads in Electron's own Node, which is the ABI the app runs on. */
function loadsInElectron(file) {
  try {
    execFileSync(
      electronBinary,
      [
        '-e',
        `new (require(${JSON.stringify(pkgDir)}))(':memory:', { nativeBinding: ${JSON.stringify(file)} }).close()`
      ],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'ignore' }
    )
    return true
  } catch {
    return false
  }
}

async function ensureElectron() {
  if (existsSync(electronCopy)) {
    console.log(`better-sqlite3 for electron ${electronVersion} already built; skipping.`)
    return
  }
  await withLock('better-sqlite3-electron', () => {
    if (existsSync(electronCopy)) return
    console.log(`Building better-sqlite3 for electron ${electronVersion}…`)
    const work = mkdtempSync(join(tmpdir(), 'ds-bsqlite-electron-'))
    try {
      // A scratch copy without build/, so the shared package is only ever read.
      cpSync(pkgDir, join(work, 'pkg'), {
        recursive: true,
        filter: (src) => !src.startsWith(join(pkgDir, 'build'))
      })
      execFileSync(
        'npx',
        [
          '--yes',
          'node-gyp',
          'rebuild',
          '--runtime=electron',
          `--target=${electronVersion}`,
          '--dist-url=https://electronjs.org/headers',
          `--arch=${process.arch}`
        ],
        { cwd: join(work, 'pkg'), stdio: 'inherit' }
      )
      const built = join(work, 'pkg', 'build', 'Release', 'better_sqlite3.node')
      if (!loadsInElectron(built)) throw new Error('The new build does not load in Electron.')
      mkdirSync(dirname(electronCopy), { recursive: true })
      const staged = `${electronCopy}.${process.pid}.tmp`
      cpSync(built, staged)
      renameSync(staged, electronCopy)
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
    console.log(`better-sqlite3 built for electron ${electronVersion}.`)
  })
}

await (target === 'node' ? ensureNode() : ensureElectron())
