// Copies the fetched llama-server (see fetch-llama-server.mjs) into build/llama-server, where
// electron-builder's extraResources picks it up and ships it as <resources>/llama-server/.
//   node scripts/stage-llama-server.mjs [--from <dir>] [--to <dir>]
//
// The folder holds llama-server and the dylibs it loads by rpath, so the whole folder is copied.
// Its version links (libllama.0.dylib -> libllama.0.7.0.dylib) are kept as written, relative, so
// they still resolve inside the app on a Mac without the fetch folder. Run
// `node scripts/fetch-llama-server.mjs` first.
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(name)
  return at === -1 ? fallback : resolve(args[at + 1] ?? fallback)
}

const from = option(
  '--from',
  join(homedir(), 'Library', 'Application Support', 'DesignStash-dev', 'llama-server', 'current')
)
const to = option('--to', resolve('build', 'llama-server'))

if (!existsSync(join(from, 'llama-server'))) {
  console.error(`No llama-server in ${from}. Run: node scripts/fetch-llama-server.mjs`)
  process.exit(1)
}

rmSync(to, { recursive: true, force: true })
mkdirSync(dirname(to), { recursive: true })
// `current` is a link to the versioned folder, so copy what it points at. verbatimSymlinks keeps
// each link's relative target: without it Node rewrites them to absolute paths into `from`.
cpSync(realpathSync(from), to, { recursive: true, verbatimSymlinks: true })
chmodSync(join(to, 'llama-server'), 0o755)

// Every link must land on a file in the staged folder. One written as an absolute path into the
// fetch folder is re-pointed at its neighbour, relatively; one that leaves the folder is refused.
const source = realpathSync(from)
const escaping = readdirSync(to).filter((name) => {
  const path = join(to, name)
  if (!lstatSync(path).isSymbolicLink()) return false
  const target = resolve(source, readlinkSync(path))
  if (!existsSync(target)) return true
  const inside = relative(source, realpathSync(target))
  if (inside.startsWith('..') || isAbsolute(inside)) return true
  rmSync(path)
  symlinkSync(inside, path)
  return !existsSync(path)
})
if (escaping.length > 0) {
  rmSync(to, { recursive: true, force: true })
  console.error(`These links point outside the staged folder: ${escaping.join(', ')}`)
  process.exit(1)
}

const files = readdirSync(to).filter((name) => statSync(join(to, name)).isFile())
console.log(`Staged llama-server (${files.length} files) in ${to}`)
