// Rebuilds better-sqlite3 for the right runtime ABI.
//   node scripts/rebuild-better-sqlite3.mjs electron   (for `pnpm dev` / packaged app)
//   node scripts/rebuild-better-sqlite3.mjs node        (for `pnpm test:unit` under Node)
//
// Why this exists: Electron and Node have different NODE_MODULE_VERSIONs, and the same
// compiled .node can't satisfy both. `@electron/rebuild` silently no-ops and
// `prebuild-install -r electron` fetches the Node prebuild here — so we do a deterministic
// node-gyp source build against Electron headers, and skip when the ABI is already correct.
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { rmSync } from 'node:fs'

const require = createRequire(import.meta.url)
const target = process.argv[2] === 'node' ? 'node' : 'electron'
const pkgDir = 'node_modules/better-sqlite3'

/** 'node' = built for Node, 'electron' = built for Electron, 'missing' = no usable binary. */
function abiState() {
  try {
    const Database = require('better-sqlite3')
    new Database(':memory:').close()
    return 'node'
  } catch (err) {
    return err.code === 'ERR_DLOPEN_FAILED' ? 'electron' : 'missing'
  }
}

const state = abiState()
if (state === target) {
  console.log(`better-sqlite3 already built for ${target}; skipping.`)
  process.exit(0)
}

console.log(`Rebuilding better-sqlite3 for ${target} (was: ${state})…`)
rmSync(`${pkgDir}/build`, { recursive: true, force: true })

if (target === 'electron') {
  const electronVersion = require('electron/package.json').version
  execSync(
    `npx --yes node-gyp rebuild --runtime=electron --target=${electronVersion} --dist-url=https://electronjs.org/headers --arch=${process.arch}`,
    { cwd: pkgDir, stdio: 'inherit' }
  )
} else {
  execSync('npm rebuild better-sqlite3', { stdio: 'inherit' })
}
console.log(`better-sqlite3 rebuilt for ${target}.`)
