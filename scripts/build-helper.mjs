// Builds the Swift helper (native/designstash-helper) for development and packaging.
//   node scripts/build-helper.mjs [--stage [dir]] [--to <dir>] [--from <binary>] [--optional]
//
// The main process runs `designstash-helper` as a child for Vision and Apple's on-device model
// (see native/designstash-helper/README.md). This compiles a release build with SwiftPM (the
// Command Line Tools are enough) and puts it outside the repo, at
// ~/Library/Application Support/DesignStash-dev/helper/designstash-helper, which is where the
// main process looks in development. DESIGNSTASH_HELPER overrides it.
//
// --stage also copies it to build/helper (or the given dir), the way stage-llama-server.mjs
// stages llama-server; electron-builder.yml ships that copy to <resources>/helper/. --from copies
// an existing binary instead of building. --optional (used by `pnpm build`) prints a warning and
// exits 0 when the helper can't be built, for example on a Mac whose SDK predates macOS 26: the
// app runs without it and simply doesn't offer Apple's model. `pnpm package:stage` leaves it off.
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const NAME = 'designstash-helper'
const PACKAGE = resolve('native', NAME)

const args = process.argv.slice(2)
const optional = args.includes('--optional')

/** Stops with an error, or with a warning and success under --optional. */
function fail(message) {
  if (optional) {
    console.log(`${message}\nSkipped the helper: Apple's on-device model won't be offered by this build.`)
    process.exit(0)
  }
  console.error(message)
  process.exit(1)
}
const option = (name) => {
  const at = args.indexOf(name)
  if (at === -1) return undefined
  const value = args[at + 1]
  return value && !value.startsWith('--') ? resolve(value) : null
}

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  fail('The helper is only built for macOS on Apple Silicon.')
}

const to =
  option('--to') ?? join(homedir(), 'Library', 'Application Support', 'DesignStash-dev', 'helper')
const stage = option('--stage')
const stageDir = stage === undefined ? null : (stage ?? resolve('build', 'helper'))

let binary = option('--from')
if (!binary) {
  const swift = ['build', '-c', 'release', '--arch', 'arm64', '--package-path', PACKAGE]
  try {
    execFileSync('swift', swift, { stdio: 'inherit' })
  } catch {
    fail('swift build failed. Install the Command Line Tools: xcode-select --install')
  }
  const binDir = execFileSync('swift', [...swift, '--show-bin-path'], { encoding: 'utf8' }).trim()
  binary = join(binDir, NAME)
}
if (!existsSync(binary)) {
  fail(`No helper binary at ${binary}`)
}

/** Copies next to the target and renames over it, so a helper that is running keeps its own file. */
function install(dir) {
  mkdirSync(dir, { recursive: true })
  const target = join(dir, NAME)
  const temp = `${target}.tmp-${process.pid}`
  copyFileSync(binary, temp)
  chmodSync(temp, 0o755)
  renameSync(temp, target)
  return target
}

console.log(`Helper ready at ${install(to)}`)
if (stageDir) console.log(`Staged helper in ${install(stageDir)}`)
