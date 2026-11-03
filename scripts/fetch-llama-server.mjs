// Fetches llama.cpp's `llama-server` (macOS arm64) for development.
//   node scripts/fetch-llama-server.mjs
//
// The vision provider runs `llama-server --model <gguf> --mmproj <mmproj>` as a child of the
// main process (see design/specs/ai.md). This puts the pinned official release outside the
// repo, at ~/Library/Application Support/DesignStash-dev/llama-server/current/llama-server,
// which is where the provider looks in development. DESIGNSTASH_LLAMA_SERVER overrides it.
// Packaging the binary for release is still open.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Buffer } from 'node:buffer'

const TAG = 'b11748'
const ASSET = `llama-${TAG}-bin-macos-arm64.tar.gz`
const URL = `https://github.com/ggml-org/llama.cpp/releases/download/${TAG}/${ASSET}`
// The digest GitHub publishes for the release asset.
const SHA256 = '003af1321ed9be9485902a2e17aad0c874a456c10f0a4ece5a735c495f3a3afb'

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.error('llama-server is only fetched for macOS on Apple Silicon.')
  process.exit(1)
}

const root = join(homedir(), 'Library', 'Application Support', 'DesignStash-dev', 'llama-server')
const versionDir = join(root, `llama-${TAG}`)
const current = join(root, 'current')

if (existsSync(join(versionDir, 'llama-server'))) {
  console.log(`llama-server ${TAG} already fetched.`)
} else {
  mkdirSync(root, { recursive: true })
  console.log(`Downloading ${ASSET}…`)
  const res = await globalThis.fetch(URL)
  if (!res.ok) {
    console.error(`Download failed: ${res.status} ${res.statusText}`)
    process.exit(1)
  }
  const bytes = Buffer.from(await res.arrayBuffer())
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== SHA256) {
    console.error(`Checksum mismatch: expected ${SHA256}, got ${digest}`)
    process.exit(1)
  }
  const archive = join(root, ASSET)
  writeFileSync(archive, bytes)
  // The archive holds llama-b<tag>/ with the binaries and the dylibs they load by rpath.
  execFileSync('tar', ['-xzf', archive, '-C', root])
  rmSync(archive)
}

rmSync(current, { force: true })
symlinkSync(versionDir, current)
console.log(`llama-server ${TAG} ready at ${join(current, 'llama-server')}`)
