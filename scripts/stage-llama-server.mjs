// Copies the fetched llama-server (see fetch-llama-server.mjs) into build/llama-server, where
// electron-builder's extraResources picks it up and ships it as <resources>/llama-server/.
//   node scripts/stage-llama-server.mjs [--from <dir>] [--to <dir>]
//
// The folder holds llama-server and the dylibs it loads by rpath, so the whole folder is copied,
// links resolved. Run `node scripts/fetch-llama-server.mjs` first.
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

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
mkdirSync(to, { recursive: true })
// dereference: `current` is a link to the versioned folder, and dylibs may be links too.
cpSync(from, to, { recursive: true, dereference: true })
chmodSync(join(to, 'llama-server'), 0o755)

const files = readdirSync(to).filter((name) => statSync(join(to, name)).isFile())
console.log(`Staged llama-server (${files.length} files) in ${to}`)
