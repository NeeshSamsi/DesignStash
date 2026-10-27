/**
 * One-time move: dev's library and settings leave the folder dev and the installed app shared
 * (`~/Library/Application Support/designstash`, the same folder as `DesignStash`) for dev's own
 * `DesignStash-dev`, and the installed app starts fresh (move.ts). Quit both apps first.
 *
 *   pnpm dev:move-library
 *
 * A clone of the shared folder goes to tmp/dev-move-library-<time>/ before anything moves.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEV_USER_DATA } from '../../src/main/dev-user-data'
import { moveDevLibrary } from './move'

const support = join(homedir(), 'Library', 'Application Support')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const result = moveDevLibrary({
  from: join(support, 'designstash'),
  to: join(support, DEV_USER_DATA),
  backupDir: join(process.cwd(), 'tmp', `dev-move-library-${stamp}`),
  log: (line) => console.log(`[move] ${line}`)
})

if (result.moved) {
  console.log(`[move] done: dev's stash is at ${result.libraryRoot}`)
} else {
  console.error(`[move] nothing moved: ${result.reason}`)
  process.exitCode = 1
}
