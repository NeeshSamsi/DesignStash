import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** Where the Electron build of better-sqlite3 lives, next to (never inside) the package's own build/. */
export function electronBindingPath(root: string, electronVersion: string, arch: string): string {
  return join(
    root,
    '.cache',
    'better-sqlite3-electron',
    `${electronVersion}-${arch}`,
    'better_sqlite3.node'
  )
}

interface BindingInputs {
  /** process.versions.electron: undefined when running under plain Node (vitest, tsx, db tooling). */
  electronVersion: string | undefined
  /** True for the installed app. It keeps the binary electron-builder rebuilt and shipped. */
  packaged: boolean
  arch: string
  /** The node_modules folder that holds better-sqlite3. */
  nodeModulesDir: () => string
  exists: (path: string) => boolean
}

/**
 * The better-sqlite3 binary to load, or undefined for its default build/Release one.
 * The default stays the Node build (unit tests, seed tool, db:studio). A dev or e2e run under
 * Electron loads its own copy instead, so the two builds never share a file.
 */
export function chooseNativeBinding(inputs: BindingInputs): string | undefined {
  const { electronVersion, packaged, arch, nodeModulesDir, exists } = inputs
  if (!electronVersion || packaged) return undefined
  const path = electronBindingPath(nodeModulesDir(), electronVersion, arch)
  return exists(path) ? path : undefined
}

/** Passed as better-sqlite3's `nativeBinding` option wherever the main process opens a database. */
export function nativeBinding(): string | undefined {
  return chooseNativeBinding({
    electronVersion: process.versions.electron,
    // `electron .` and electron-vite set defaultApp; an installed app does not.
    packaged: !process.defaultApp,
    arch: process.arch,
    nodeModulesDir: () =>
      dirname(dirname(createRequire(__filename).resolve('better-sqlite3/package.json'))),
    exists: existsSync
  })
}
